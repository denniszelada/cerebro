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

export interface IBus {
  publish<T = unknown>(topic: string, payload: T, options?: PublishOptions): Promise<void>;

  subscribe<T = unknown>(
    topic: string,
    handler: BusHandler<T>,
    options?: SubscribeOptions,
  ): Unsubscribe;

  request<Req = unknown, Res = unknown>(
    topic: string,
    payload: Req,
    options?: RequestOptions,
  ): Promise<BusEnvelope<Res>>;

  openStream<S = unknown, R = unknown>(
    topic: string,
    options?: StreamOptions,
  ): Promise<StreamHandle<S, R>>;

  destroy(): Promise<void>;
}
