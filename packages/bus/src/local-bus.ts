import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { IBus } from './bus.interface.js';
import type {
  BusEnvelope,
  BusHandler,
  PublishOptions,
  RequestOptions,
  StreamHandle,
  StreamOptions,
  SubscribeOptions,
  Unsubscribe,
} from './types.js';

export class LocalBus implements IBus {
  private readonly emitter = new EventEmitter();
  private destroyed = false;

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  async publish<T = unknown>(
    topic: string,
    payload: T,
    options?: PublishOptions,
  ): Promise<void> {
    this.assertNotDestroyed();
    const envelope = this.createEnvelope(topic, payload, options);
    setImmediate(() => {
      this.emitter.emit(topic, envelope);
      this.emitWildcards(topic, envelope);
    });
  }

  subscribe<T = unknown>(
    topic: string,
    handler: BusHandler<T>,
    options?: SubscribeOptions,
  ): Unsubscribe {
    this.assertNotDestroyed();

    const wrappedHandler = (envelope: BusEnvelope<T>) => {
      if (options?.filter && !options.filter(envelope)) return;
      void Promise.resolve(handler(envelope)).catch((err) => {
        console.error(`[LocalBus] Handler error on topic "${topic}":`, err);
      });
    };

    this.emitter.on(topic, wrappedHandler);
    return () => {
      this.emitter.off(topic, wrappedHandler);
    };
  }

  async request<Req = unknown, Res = unknown>(
    topic: string,
    payload: Req,
    options?: RequestOptions,
  ): Promise<BusEnvelope<Res>> {
    this.assertNotDestroyed();
    const correlationId = options?.correlationId ?? randomUUID();
    const replyTo = `__reply__.${correlationId}`;
    const timeout = options?.timeout ?? 5000;

    return new Promise<BusEnvelope<Res>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emitter.off(replyTo, onReply);
        reject(new Error(`Request timeout after ${timeout}ms on topic "${topic}"`));
      }, timeout);

      const onReply = (envelope: BusEnvelope<Res>) => {
        clearTimeout(timer);
        this.emitter.off(replyTo, onReply);
        resolve(envelope);
      };

      this.emitter.on(replyTo, onReply);

      const envelope = this.createEnvelope(topic, payload, {
        correlationId,
        metadata: { ...options?.metadata, replyTo },
      });

      setImmediate(() => {
        this.emitter.emit(topic, envelope);
        this.emitWildcards(topic, envelope);
      });
    });
  }

  async openStream<S = unknown, R = unknown>(
    topic: string,
    options?: StreamOptions,
  ): Promise<StreamHandle<S, R>> {
    this.assertNotDestroyed();
    const streamId = randomUUID();
    const sendTopic = `__stream__.${streamId}.send`;
    const recvTopic = `__stream__.${streamId}.recv`;
    const bufferSize = options?.bufferSize ?? 100;
    const buffer: BusEnvelope<R>[] = [];
    let closed = false;
    let resolver: ((value: IteratorResult<R>) => void) | null = null;

    const onMessage = (envelope: BusEnvelope<R>) => {
      if (resolver) {
        const res = resolver;
        resolver = null;
        res({ value: envelope.payload, done: false });
      } else if (buffer.length < bufferSize) {
        buffer.push(envelope);
      }
    };

    this.emitter.on(recvTopic, onMessage);

    const handle: StreamHandle<S, R> = {
      id: streamId,
      get closed() {
        return closed;
      },

      async send(message: S): Promise<void> {
        if (closed) throw new Error('Stream is closed');
        const envelope = {
          id: randomUUID(),
          topic: sendTopic,
          payload: message,
          timestamp: Date.now(),
        };
        setImmediate(() => {
          self.emitter.emit(sendTopic, envelope);
        });
      },

      receive(): AsyncIterableIterator<R> {
        return {
          next(): Promise<IteratorResult<R>> {
            if (closed) return Promise.resolve({ value: undefined as never, done: true });
            const buffered = buffer.shift();
            if (buffered) {
              return Promise.resolve({ value: buffered.payload, done: false });
            }
            return new Promise<IteratorResult<R>>((resolve) => {
              if (closed) {
                resolve({ value: undefined as never, done: true });
                return;
              }
              resolver = resolve;
            });
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
      },

      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        self.emitter.off(recvTopic, onMessage);
        if (resolver) {
          const res = resolver;
          resolver = null;
          res({ value: undefined as never, done: true });
        }
      },
    };

    const self = this;

    // Publish stream availability
    setImmediate(() => {
      this.emitter.emit(topic, {
        id: randomUUID(),
        topic,
        payload: { streamId, sendTopic, recvTopic },
        timestamp: Date.now(),
      });
    });

    // Auto-close on idle timeout
    if (options?.idleTimeout) {
      setTimeout(() => {
        if (!closed) void handle.close();
      }, options.idleTimeout);
    }

    // Auto-close on max duration
    if (options?.maxDuration) {
      setTimeout(() => {
        if (!closed) void handle.close();
      }, options.maxDuration);
    }

    return handle;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.emitter.removeAllListeners();
  }

  private createEnvelope<T>(
    topic: string,
    payload: T,
    options?: PublishOptions,
  ): BusEnvelope<T> {
    return {
      id: randomUUID(),
      topic,
      payload,
      timestamp: Date.now(),
      correlationId: options?.correlationId,
      metadata: options?.metadata,
    };
  }

  private emitWildcards<T>(topic: string, envelope: BusEnvelope<T>): void {
    const parts = topic.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const wildcard = parts.slice(0, i).join('.') + '.*';
      this.emitter.emit(wildcard, envelope);
    }
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('Bus has been destroyed');
    }
  }
}
