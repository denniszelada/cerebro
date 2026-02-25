export interface BusEnvelope<T = unknown> {
  id: string;
  topic: string;
  payload: T;
  timestamp: number;
  correlationId?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishOptions {
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface SubscribeOptions {
  queue?: string;
  filter?: (envelope: BusEnvelope) => boolean;
}

export interface RequestOptions {
  timeout?: number;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface StreamOptions {
  bufferSize?: number;
  idleTimeout?: number;
  maxDuration?: number;
}

export interface StreamHandle<S = unknown, R = unknown> {
  readonly id: string;
  send(message: S): Promise<void>;
  receive(): AsyncIterableIterator<R>;
  close(): Promise<void>;
  readonly closed: boolean;
}

export type Unsubscribe = () => void;

export type BusHandler<T = unknown> = (envelope: BusEnvelope<T>) => void | Promise<void>;
