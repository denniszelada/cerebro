import type { IBus } from '@denniszelada/cerebro-bus';
import type { ILLMProvider } from '@denniszelada/cerebro-llm';
import type { ExecutionContext } from './types/context.js';
import { createExecutionContext } from './types/context.js';
import type { ExpertConfig, ExpertResult, ExpertTask, IExpert } from './types/expert.js';

export abstract class Expert implements IExpert {
  abstract readonly name: string;
  abstract readonly domain: string;
  abstract readonly capabilities: string[];
  readonly description?: string;
  readonly llmProvider?: string;

  protected bus?: IBus;
  protected llm?: ILLMProvider;

  abstract process(task: ExpertTask, context: ExecutionContext): Promise<ExpertResult>;

  register(bus: IBus): void {
    this.bus = bus;
    const topic = `expert.${this.name}.request`;
    bus.subscribe(topic, async (envelope) => {
      const { task, context: rawContext } = envelope.payload as {
        task: ExpertTask;
        context: Record<string, unknown>;
      };
      const replyTo = envelope.metadata?.['replyTo'] as string | undefined;

      // Reconstruct ExecutionContext from serialized data
      const context = this.reconstructContext(rawContext);

      try {
        const result = await this.process(task, context);
        if (replyTo) {
          await bus.publish(replyTo, result, {
            correlationId: envelope.correlationId,
          });
        }
      } catch (error) {
        if (replyTo) {
          await bus.publish(replyTo, {
            type: 'error',
            data: { message: (error as Error).message },
            expertName: this.name,
          }, {
            correlationId: envelope.correlationId,
          });
        }
      }
    });
  }

  private reconstructContext(raw: Record<string, unknown>): ExecutionContext {
    const message = raw['message'] as Record<string, unknown> | undefined;
    const metadata = raw['metadata'] as Record<string, unknown> | undefined;
    const stepResults = raw['stepResults'] as Record<string, unknown> | undefined;

    const ctx = createExecutionContext(
      message as Parameters<typeof createExecutionContext>[0],
      metadata,
    );

    if (stepResults) {
      for (const [key, value] of Object.entries(stepResults)) {
        ctx.setStepResult(key, value);
      }
    }

    return ctx;
  }

  setLLM(provider: ILLMProvider): void {
    this.llm = provider;
  }

  getRegistration(): ExpertConfig {
    return {
      name: this.name,
      domain: this.domain,
      capabilities: this.capabilities,
      description: this.description,
      llmProvider: this.llmProvider,
    };
  }
}
