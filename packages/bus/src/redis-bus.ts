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

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  tls?: boolean;
  url?: string;
}

type RedisClient = {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string | string[], callback?: () => void): Promise<number>;
  psubscribe(pattern: string | string[], callback?: () => void): Promise<number>;
  unsubscribe(channel?: string | string[]): Promise<number>;
  punsubscribe(pattern?: string | string[]): Promise<number>;
  on(event: string, callback: (...args: unknown[]) => void): unknown;
  off(event: string, callback: (...args: unknown[]) => void): unknown;
  xadd(key: string, ...args: unknown[]): Promise<string | null>;
  xread(...args: unknown[]): Promise<unknown[] | null>;
  duplicate(): RedisClient;
  disconnect(): Promise<void>;
  quit(): Promise<string>;
};

export class RedisBus implements IBus {
  private pubClient: RedisClient;
  private subClient: RedisClient;
  private streamClient: RedisClient;
  private readonly subscriptions = new Map<string, Set<BusHandler>>();
  private readonly patternSubscriptions = new Map<string, Set<BusHandler>>();
  private readonly prefix: string;
  private destroyed = false;

  constructor(
    redisFactory: () => RedisClient,
    config?: RedisConfig,
  ) {
    this.pubClient = redisFactory();
    this.subClient = redisFactory();
    this.streamClient = redisFactory();
    this.prefix = config?.keyPrefix ?? 'cerebro:';
    this.setupMessageHandler();
  }

  private setupMessageHandler(): void {
    this.subClient.on('message', (_channel: unknown, message: unknown) => {
      const channel = _channel as string;
      const handlers = this.subscriptions.get(channel);
      if (!handlers) return;
      try {
        const envelope = JSON.parse(message as string) as BusEnvelope;
        for (const handler of handlers) {
          void Promise.resolve(handler(envelope)).catch((err) => {
            console.error(`[RedisBus] Handler error on channel "${channel}":`, err);
          });
        }
      } catch (err) {
        console.error(`[RedisBus] Failed to parse message on channel "${channel}":`, err);
      }
    });

    this.subClient.on('pmessage', (_pattern: unknown, _channel: unknown, message: unknown) => {
      const pattern = _pattern as string;
      const handlers = this.patternSubscriptions.get(pattern);
      if (!handlers) return;
      try {
        const envelope = JSON.parse(message as string) as BusEnvelope;
        for (const handler of handlers) {
          void Promise.resolve(handler(envelope)).catch((err) => {
            console.error(`[RedisBus] Handler error on pattern "${pattern}":`, err);
          });
        }
      } catch (err) {
        console.error(`[RedisBus] Failed to parse message on pattern "${pattern}":`, err);
      }
    });
  }

  async publish<T = unknown>(
    topic: string,
    payload: T,
    options?: PublishOptions,
  ): Promise<void> {
    this.assertNotDestroyed();
    const envelope = this.createEnvelope(topic, payload, options);
    const channel = this.prefix + topic;
    await this.pubClient.publish(channel, JSON.stringify(envelope));
  }

  subscribe<T = unknown>(
    topic: string,
    handler: BusHandler<T>,
    options?: SubscribeOptions,
  ): Unsubscribe {
    this.assertNotDestroyed();
    const channel = this.prefix + topic;
    const isPattern = topic.includes('*');

    const wrappedHandler: BusHandler = (envelope) => {
      if (options?.filter && !options.filter(envelope)) return;
      return (handler as BusHandler)(envelope);
    };

    if (isPattern) {
      let handlers = this.patternSubscriptions.get(channel);
      if (!handlers) {
        handlers = new Set();
        this.patternSubscriptions.set(channel, handlers);
        void this.subClient.psubscribe(channel);
      }
      handlers.add(wrappedHandler);

      return () => {
        handlers!.delete(wrappedHandler);
        if (handlers!.size === 0) {
          this.patternSubscriptions.delete(channel);
          void this.subClient.punsubscribe(channel);
        }
      };
    } else {
      let handlers = this.subscriptions.get(channel);
      if (!handlers) {
        handlers = new Set();
        this.subscriptions.set(channel, handlers);
        void this.subClient.subscribe(channel);
      }
      handlers.add(wrappedHandler);

      return () => {
        handlers!.delete(wrappedHandler);
        if (handlers!.size === 0) {
          this.subscriptions.delete(channel);
          void this.subClient.unsubscribe(channel);
        }
      };
    }
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
        unsub();
        reject(new Error(`Request timeout after ${timeout}ms on topic "${topic}"`));
      }, timeout);

      const unsub = this.subscribe<Res>(replyTo, (envelope) => {
        clearTimeout(timer);
        unsub();
        resolve(envelope);
      });

      const envelope = this.createEnvelope(topic, payload, {
        correlationId,
        metadata: { ...options?.metadata, replyTo },
      });
      const channel = this.prefix + topic;
      void this.pubClient.publish(channel, JSON.stringify(envelope));
    });
  }

  async openStream<S = unknown, R = unknown>(
    topic: string,
    options?: StreamOptions,
  ): Promise<StreamHandle<S, R>> {
    this.assertNotDestroyed();
    const streamId = randomUUID();
    const sendKey = `${this.prefix}stream:${streamId}:send`;
    const recvKey = `${this.prefix}stream:${streamId}:recv`;
    let closed = false;

    const handle: StreamHandle<S, R> = {
      id: streamId,
      get closed() {
        return closed;
      },

      send: async (message: S): Promise<void> => {
        if (closed) throw new Error('Stream is closed');
        await this.streamClient.xadd(
          sendKey,
          '*',
          'data',
          JSON.stringify(message),
        );
      },

      receive: (): AsyncIterableIterator<R> => {
        let lastId = '0-0';

        const poll = async (): Promise<IteratorResult<R>> => {
          if (closed) return { value: undefined as never, done: true };
          try {
            const result = await this.streamClient.xread(
              'COUNT', 1,
              'BLOCK', 1000,
              'STREAMS', recvKey, lastId,
            );
            if (closed) return { value: undefined as never, done: true };
            if (!result || !Array.isArray(result) || (result as unknown[]).length === 0) {
              if (closed) return { value: undefined as never, done: true };
              return poll();
            }
            const stream = (result as [string, [string, string[]][]][])[0];
            if (!stream) return poll();
            const entries = stream[1];
            if (!entries || entries.length === 0) return poll();
            const entry = entries[0]!;
            lastId = entry[0];
            const data = JSON.parse(entry[1][1]!) as R;
            return { value: data, done: false };
          } catch {
            if (closed) return { value: undefined as never, done: true };
            throw new Error('Stream read error');
          }
        };

        return {
          next: poll,
          [Symbol.asyncIterator]() {
            return this;
          },
        } as AsyncIterableIterator<R>;
      },

      close: async (): Promise<void> => {
        if (closed) return;
        closed = true;
      },
    };

    // Publish stream availability
    await this.publish(topic, { streamId, sendKey, recvKey });

    if (options?.idleTimeout) {
      setTimeout(() => {
        if (!closed) void handle.close();
      }, options.idleTimeout);
    }

    if (options?.maxDuration) {
      setTimeout(() => {
        if (!closed) void handle.close();
      }, options.maxDuration);
    }

    return handle;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    await Promise.all([
      this.pubClient.quit(),
      this.subClient.quit(),
      this.streamClient.quit(),
    ]);
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

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('Bus has been destroyed');
    }
  }
}
