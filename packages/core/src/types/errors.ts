export enum ErrorCategory {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
  RATE_LIMITED = 'RATE_LIMITED',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
}

export class CerebroError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: Error;

  constructor(
    message: string,
    options: {
      category?: ErrorCategory;
      code?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    } = {},
  ) {
    super(message);
    this.name = 'CerebroError';
    this.category = options.category ?? ErrorCategory.PERMANENT;
    this.code = options.code ?? 'CEREBRO_ERROR';
    this.details = options.details;
    this.cause = options.cause;
  }

  get isTransient(): boolean {
    return this.category === ErrorCategory.TRANSIENT || this.category === ErrorCategory.RATE_LIMITED;
  }
}

export class TimeoutError extends CerebroError {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, options: { cause?: Error } = {}) {
    super(message, {
      category: ErrorCategory.TRANSIENT,
      code: 'TIMEOUT',
      details: { timeoutMs },
      cause: options.cause,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class CircuitOpenError extends CerebroError {
  readonly expertName: string;
  readonly resetAfterMs: number;

  constructor(expertName: string, resetAfterMs: number) {
    super(`Circuit open for expert "${expertName}", resets in ${resetAfterMs}ms`, {
      category: ErrorCategory.CIRCUIT_OPEN,
      code: 'CIRCUIT_OPEN',
      details: { expertName, resetAfterMs },
    });
    this.name = 'CircuitOpenError';
    this.expertName = expertName;
    this.resetAfterMs = resetAfterMs;
  }
}

export class ExpertError extends CerebroError {
  readonly expertName: string;

  constructor(
    expertName: string,
    message: string,
    options: {
      category?: ErrorCategory;
      code?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    } = {},
  ) {
    super(message, { ...options, code: options.code ?? 'EXPERT_ERROR' });
    this.name = 'ExpertError';
    this.expertName = expertName;
  }
}

export class PipelineError extends CerebroError {
  readonly stepId: string;
  readonly pipelineId?: string;

  constructor(
    stepId: string,
    message: string,
    options: {
      pipelineId?: string;
      category?: ErrorCategory;
      cause?: Error;
    } = {},
  ) {
    super(message, {
      category: options.category ?? ErrorCategory.PERMANENT,
      code: 'PIPELINE_ERROR',
      details: { stepId, pipelineId: options.pipelineId },
      cause: options.cause,
    });
    this.name = 'PipelineError';
    this.stepId = stepId;
    this.pipelineId = options.pipelineId;
  }
}
