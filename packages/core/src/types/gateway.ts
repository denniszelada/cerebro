import type { ExecutionContext } from './context.js';

export interface GatewayInput {
  type: string;
  source: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export interface GatewayOutput {
  success: boolean;
  data?: unknown;
  error?: string;
  traceId: string;
  duration: number;
}

export type GatewayMiddleware = (
  input: GatewayInput,
  context: ExecutionContext,
  next: () => Promise<GatewayOutput>,
) => Promise<GatewayOutput>;

export interface GatewayConfig {
  middlewares?: GatewayMiddleware[];
  defaultTimeout?: number;
}

export interface IGateway {
  process(input: GatewayInput): Promise<GatewayOutput>;
  use(middleware: GatewayMiddleware): void;
}
