import type { ExecutionContext } from './context.js';

export interface ExpertCapability {
  name: string;
  description: string;
}

export interface ExpertConfig {
  name: string;
  domain: string;
  capabilities: string[];
  description?: string;
  llmProvider?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface ExpertTask {
  id: string;
  instruction: string;
  data?: Record<string, unknown>;
  expectedOutput?: string;
}

export interface ExpertResult {
  type: string;
  data: unknown;
  expertName: string;
  metadata?: Record<string, unknown>;
  duration?: number;
}

export interface ExpertRegistration {
  name: string;
  domain: string;
  capabilities: string[];
  description?: string;
  llmProvider?: string;
}

export interface IExpert {
  readonly name: string;
  readonly domain: string;
  readonly capabilities: string[];
  readonly description?: string;
  readonly llmProvider?: string;

  process(task: ExpertTask, context: ExecutionContext): Promise<ExpertResult>;
}
