export interface MessageContext {
  traceId: string;
  spanId: string;
  sessionId?: string;
  tenantId?: string;
  userId?: string;
  source?: string;
  timestamp: number;
}

export interface PipelineState {
  pipelineId: string;
  currentStepId?: string;
  stepResults: Map<string, unknown>;
  startedAt: number;
  metadata: Record<string, unknown>;
}

export interface ExecutionContext {
  readonly message: MessageContext;
  readonly pipeline?: PipelineState;
  readonly metadata: Record<string, unknown>;

  getStepResult<T = unknown>(stepId: string): T | undefined;
  setStepResult(stepId: string, result: unknown): void;
  fork(overrides?: Partial<MessageContext>): ExecutionContext;
  toJSON(): Record<string, unknown>;
}

export function createMessageContext(
  overrides?: Partial<MessageContext>,
): MessageContext {
  return {
    traceId: overrides?.traceId ?? generateId(),
    spanId: overrides?.spanId ?? generateId(),
    sessionId: overrides?.sessionId,
    tenantId: overrides?.tenantId,
    userId: overrides?.userId,
    source: overrides?.source,
    timestamp: overrides?.timestamp ?? Date.now(),
  };
}

export function createExecutionContext(
  message?: Partial<MessageContext>,
  metadata?: Record<string, unknown>,
): ExecutionContext {
  const msg = createMessageContext(message);
  const stepResults = new Map<string, unknown>();
  const meta = { ...metadata };

  return {
    message: msg,
    pipeline: undefined,
    metadata: meta,

    getStepResult<T = unknown>(stepId: string): T | undefined {
      return stepResults.get(stepId) as T | undefined;
    },

    setStepResult(stepId: string, result: unknown): void {
      stepResults.set(stepId, result);
    },

    fork(overrides?: Partial<MessageContext>): ExecutionContext {
      return createExecutionContext(
        { ...msg, spanId: generateId(), ...overrides },
        { ...meta },
      );
    },

    toJSON(): Record<string, unknown> {
      return {
        message: msg,
        metadata: meta,
        stepResults: Object.fromEntries(stepResults),
      };
    },
  };
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
