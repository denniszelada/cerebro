import type { IBus } from '@denniszelada/cerebro-bus';
import type { ILLMProvider, LLMMessage } from '@denniszelada/cerebro-llm';
import type { ProviderRegistry } from '@denniszelada/cerebro-llm';
import type { IKnowledgeStore } from '@denniszelada/cerebro-knowledge';
import type {
  BrainConfig,
  BrainRequest,
  BrainResponse,
  IBrain,
  RoutingDecision,
} from './types/brain.js';
import type { ExpertRegistration } from './types/expert.js';
import type { PipelineDefinition } from './types/pipeline.js';
import { createExecutionContext } from './types/context.js';
import { Pipeline } from './pipeline/builder.js';
import { PipelineExecutor, type PipelineExecutorConfig } from './pipeline/executor.js';

export interface BrainDependencies {
  bus: IBus;
  llmRegistry: ProviderRegistry;
  knowledge?: IKnowledgeStore;
  executorConfig?: Partial<PipelineExecutorConfig>;
}

export class Brain implements IBrain {
  readonly config: BrainConfig;
  readonly experts: Map<string, ExpertRegistration> = new Map();
  private readonly llmRegistry: ProviderRegistry;
  private readonly knowledge?: IKnowledgeStore;
  private readonly executor: PipelineExecutor;

  constructor(config: BrainConfig, deps: BrainDependencies) {
    this.config = config;
    this.llmRegistry = deps.llmRegistry;
    this.knowledge = deps.knowledge;
    this.executor = new PipelineExecutor({
      bus: deps.bus,
      defaultTimeout: config.defaultTimeout ?? 30_000,
      ...deps.executorConfig,
    });
  }

  registerExpert(expert: ExpertRegistration): void {
    this.experts.set(expert.name, expert);
  }

  unregisterExpert(name: string): void {
    this.experts.delete(name);
  }

  async route(request: BrainRequest): Promise<RoutingDecision> {
    const llm = this.getLLMProvider();
    const expertDescriptions = this.buildExpertDescriptions();

    let knowledgeContext = '';
    if (this.knowledge) {
      const results = await this.knowledge.search(request.input, { limit: 5 });
      if (results.length > 0) {
        knowledgeContext = '\n\nRelevant knowledge:\n' + results
          .map((r) => `- ${r.entry.key} (${r.entry.domain}): ${r.entry.description}`)
          .join('\n');
      }
    }

    const systemPrompt = this.config.systemPrompt ?? DEFAULT_BRAIN_SYSTEM_PROMPT;
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Available experts:\n${expertDescriptions}\n${knowledgeContext}\n\nRequest: ${request.input}\n\nRespond with a JSON routing decision: { "strategy": "chain"|"parallel"|"stream"|"direct", "steps": [{ "expertId": string, "task": string, "dependsOn": string[] }], "reasoning": string }`,
      },
    ];

    if (request.conversationHistory) {
      const historyMsgs: LLMMessage[] = request.conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      messages.splice(1, 0, ...historyMsgs);
    }

    const response = await llm.chat(messages, {
      responseFormat: 'json',
      temperature: 0.1,
    });

    try {
      return JSON.parse(response.content) as RoutingDecision;
    } catch {
      // Fallback: if LLM doesn't return valid JSON, create a direct route
      return {
        strategy: 'direct',
        steps: [],
        reasoning: response.content,
      };
    }
  }

  buildPipeline(decision: RoutingDecision): PipelineDefinition {
    switch (decision.strategy) {
      case 'chain': {
        let pipeline = Pipeline.from(decision.steps[0]!.expertId, {
          instruction: decision.steps[0]!.task,
        });
        for (let i = 1; i < decision.steps.length; i++) {
          const step = decision.steps[i]!;
          pipeline = pipeline.then(Pipeline.from(step.expertId, { instruction: step.task }));
        }
        return pipeline.build('brain-chain');
      }

      case 'parallel': {
        const pipelines = decision.steps.map((step) =>
          Pipeline.from(step.expertId, { instruction: step.task }),
        );
        return Pipeline.parallel(...pipelines).merge().build('brain-parallel');
      }

      case 'stream':
      case 'direct':
      default: {
        if (decision.steps.length === 0) {
          // No experts needed, brain handles directly
          return Pipeline.from('__brain__', {
            instruction: decision.reasoning,
          }).build('brain-direct');
        }
        if (decision.steps.length === 1) {
          return Pipeline.from(decision.steps[0]!.expertId, {
            instruction: decision.steps[0]!.task,
          }).build('brain-single');
        }
        // Build based on dependencies
        return this.buildDependencyPipeline(decision);
      }
    }
  }

  async execute(request: BrainRequest): Promise<BrainResponse> {
    const context = createExecutionContext(undefined, {
      brainRequest: request,
    });

    // Route the request
    const routing = await this.route(request);

    // If no experts needed (direct response from brain)
    if (routing.steps.length === 0) {
      return {
        output: routing.reasoning,
        routing,
      };
    }

    // Build and execute pipeline
    const pipeline = this.buildPipeline(routing);
    const { result, trace } = await this.executor.execute(pipeline, context);

    return {
      output: typeof result === 'string' ? result : JSON.stringify(result),
      data: result as Record<string, unknown>,
      routing,
      pipelineTrace: trace,
    };
  }

  private buildDependencyPipeline(decision: RoutingDecision): PipelineDefinition {
    // Group steps by dependency level
    const noDeps = decision.steps.filter((s) => !s.dependsOn || s.dependsOn.length === 0);
    const withDeps = decision.steps.filter((s) => s.dependsOn && s.dependsOn.length > 0);

    let pipeline: Pipeline;

    if (noDeps.length > 1) {
      pipeline = Pipeline.parallel(
        ...noDeps.map((s) => Pipeline.from(s.expertId, { instruction: s.task })),
      ).merge();
    } else if (noDeps.length === 1) {
      pipeline = Pipeline.from(noDeps[0]!.expertId, { instruction: noDeps[0]!.task });
    } else {
      pipeline = Pipeline.from(decision.steps[0]!.expertId, {
        instruction: decision.steps[0]!.task,
      });
    }

    for (const step of withDeps) {
      pipeline = pipeline.then(Pipeline.from(step.expertId, { instruction: step.task }));
    }

    return pipeline.build('brain-dependency');
  }

  private getLLMProvider(): ILLMProvider {
    if (this.config.llmProvider) {
      return this.llmRegistry.getOrThrow(this.config.llmProvider);
    }
    return this.llmRegistry.getDefault();
  }

  private buildExpertDescriptions(): string {
    if (this.experts.size === 0) return 'No experts available.';

    return [...this.experts.values()]
      .map(
        (e) =>
          `- ${e.name} (${e.domain}): capabilities=[${e.capabilities.join(', ')}]${e.description ? ` - ${e.description}` : ''}`,
      )
      .join('\n');
  }
}

const DEFAULT_BRAIN_SYSTEM_PROMPT = `You are the Brain of an agentic system. Your role is to analyze incoming requests and route them to the appropriate expert(s).

Given a request and available experts, determine:
1. Which expert(s) should handle this request
2. What strategy to use (chain for sequential, parallel for concurrent, direct for single expert)
3. What specific task each expert should perform

Respond with a JSON routing decision.`;
