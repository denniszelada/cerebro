export interface ExpertStep {
  type: 'expert';
  id: string;
  expertName: string;
  instruction?: string;
  timeout?: number;
  retries?: number;
  fallback?: PipelineStep;
}

export interface ChainStep {
  type: 'chain';
  id: string;
  steps: PipelineStep[];
}

export interface ParallelStep {
  type: 'parallel';
  id: string;
  steps: PipelineStep[];
  merge?: string;
}

export interface ConditionalStep {
  type: 'conditional';
  id: string;
  condition: string;
  onTrue: PipelineStep;
  onFalse?: PipelineStep;
}

export interface MapStep {
  type: 'map';
  id: string;
  sourceKey: string;
  step: PipelineStep;
  maxConcurrency?: number;
}

export type PipelineStep =
  | ExpertStep
  | ChainStep
  | ParallelStep
  | ConditionalStep
  | MapStep;

export interface PipelineDefinition {
  id: string;
  name?: string;
  description?: string;
  root: PipelineStep;
  metadata?: Record<string, unknown>;
}

export interface ErrorStrategy {
  type: 'retry' | 'fallback' | 'skip' | 'abort' | 'circuit-breaker';
  maxRetries?: number;
  delayMs?: number;
  fallbackExpert?: string;
  circuitThreshold?: number;
  circuitResetMs?: number;
}

export interface StepTrace {
  stepId: string;
  stepType: PipelineStep['type'];
  expertName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  attempts: number;
  error?: string;
  result?: unknown;
  children?: StepTrace[];
}

export interface PipelineTrace {
  pipelineId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  duration?: number;
  root: StepTrace;
}
