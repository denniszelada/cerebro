import type { ExpertRegistration } from './expert.js';
import type { PipelineDefinition } from './pipeline.js';

export interface BrainConfig {
  llmProvider?: string;
  systemPrompt?: string;
  maxPipelineDepth?: number;
  defaultTimeout?: number;
  defaultRetries?: number;
}

export interface BrainRequest {
  input: string;
  data?: Record<string, unknown>;
  conversationHistory?: ConversationMessage[];
  constraints?: RoutingConstraint[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface BrainResponse {
  output: string;
  data?: Record<string, unknown>;
  routing: RoutingDecision;
  pipelineTrace?: import('./pipeline.js').PipelineTrace;
}

export interface RoutingDecision {
  strategy: 'chain' | 'parallel' | 'stream' | 'direct';
  steps: RoutingStep[];
  reasoning: string;
}

export interface RoutingStep {
  expertId: string;
  task: string;
  dependsOn?: string[];
}

export interface RoutingConstraint {
  type: 'exclude' | 'prefer' | 'require';
  expertName: string;
  reason?: string;
}

export interface IBrain {
  readonly config: BrainConfig;
  readonly experts: ReadonlyMap<string, ExpertRegistration>;

  route(request: BrainRequest): Promise<RoutingDecision>;
  execute(request: BrainRequest): Promise<BrainResponse>;
  buildPipeline(decision: RoutingDecision): PipelineDefinition;
  registerExpert(expert: ExpertRegistration): void;
  unregisterExpert(name: string): void;
}
