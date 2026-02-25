import { randomUUID } from 'node:crypto';
import type { IBus } from './bus.interface.js';
import type { BusEnvelope } from './types.js';

export interface StreamSessionOptions {
  participants: string[];
  idleTimeout?: number;
  maxDuration?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class StreamSession {
  readonly id: string;
  private readonly bus: IBus;
  private readonly participants: Set<string>;
  private readonly unsubscribes: Array<() => void> = [];
  private readonly messageQueues = new Map<string, unknown[]>();
  private readonly waiters = new Map<string, ((message: unknown) => void)[]>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private closed = false;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private maxDurationTimer?: ReturnType<typeof setTimeout>;
  private readonly idleTimeout?: number;

  constructor(bus: IBus, options: StreamSessionOptions) {
    this.id = randomUUID();
    this.bus = bus;
    this.participants = new Set(options.participants);
    this.idleTimeout = options.idleTimeout;

    for (const participant of this.participants) {
      this.messageQueues.set(participant, []);
      this.waiters.set(participant, []);
    }

    this.setupSubscriptions();

    if (options.idleTimeout) {
      this.resetIdleTimer(options.idleTimeout);
    }

    if (options.maxDuration) {
      this.maxDurationTimer = setTimeout(() => {
        void this.close();
      }, options.maxDuration);
    }
  }

  private setupSubscriptions(): void {
    for (const participant of this.participants) {
      const topic = `session.${this.id}.${participant}`;
      const unsub = this.bus.subscribe(topic, (envelope: BusEnvelope) => {
        this.handleIncoming(participant, envelope);
      });
      this.unsubscribes.push(unsub);
    }
  }

  private handleIncoming(participant: string, envelope: BusEnvelope): void {
    if (this.closed) return;
    this.touchIdle();

    const correlationId = envelope.correlationId;
    if (correlationId) {
      const key = `${participant}:${correlationId}`;
      const pending = this.pendingRequests.get(key);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(key);
        pending.resolve(envelope.payload);
        return;
      }
    }

    const waiterList = this.waiters.get(participant);
    if (waiterList && waiterList.length > 0) {
      const waiter = waiterList.shift()!;
      waiter(envelope.payload);
      return;
    }

    const queue = this.messageQueues.get(participant);
    if (queue) {
      queue.push(envelope.payload);
    }
  }

  async send(from: string, to: string, message: unknown): Promise<void> {
    this.assertOpen();
    this.assertParticipant(from);
    this.assertParticipant(to);
    this.touchIdle();

    const topic = `session.${this.id}.${to}`;
    await this.bus.publish(topic, message, {
      metadata: { from, sessionId: this.id },
    });
  }

  async ask(
    from: string,
    to: string,
    question: unknown,
    timeout = 5000,
  ): Promise<unknown> {
    this.assertOpen();
    this.assertParticipant(from);
    this.assertParticipant(to);
    this.touchIdle();

    const correlationId = randomUUID();
    const topic = `session.${this.id}.${to}`;

    const key = `${from}:${correlationId}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(key);
        reject(new Error(`Ask timeout after ${timeout}ms from "${from}" to "${to}"`));
      }, timeout);

      this.pendingRequests.set(key, { resolve, reject, timer });

      void this.bus.publish(topic, question, {
        correlationId,
        metadata: { from, sessionId: this.id, replyTo: `session.${this.id}.${from}` },
      });
    });
  }

  listen(participant: string): AsyncIterableIterator<unknown> {
    this.assertParticipant(participant);
    const self = this;

    return {
      next(): Promise<IteratorResult<unknown>> {
        if (self.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }

        const queue = self.messageQueues.get(participant);
        if (queue && queue.length > 0) {
          return Promise.resolve({ value: queue.shift()!, done: false });
        }

        return new Promise<IteratorResult<unknown>>((resolve) => {
          if (self.closed) {
            resolve({ value: undefined, done: true });
            return;
          }

          const waiterList = self.waiters.get(participant);
          if (waiterList) {
            waiterList.push((message) => {
              resolve({ value: message, done: false });
            });
          }
        });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Session closed'));
    }
    this.pendingRequests.clear();

    for (const [, waiterList] of this.waiters) {
      for (const waiter of waiterList) {
        waiter(undefined);
      }
      waiterList.length = 0;
    }

    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes.length = 0;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  private touchIdle(): void {
    if (this.idleTimeout) {
      this.resetIdleTimer(this.idleTimeout);
    }
  }

  private resetIdleTimer(timeout: number): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.close();
    }, timeout);
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('Session is closed');
    }
  }

  private assertParticipant(name: string): void {
    if (!this.participants.has(name)) {
      throw new Error(`"${name}" is not a participant in this session`);
    }
  }
}
