import type {
  GatewayConfig,
  GatewayInput,
  GatewayMiddleware,
  GatewayOutput,
  IGateway,
} from './types/gateway.js';
import type { ExecutionContext } from './types/context.js';
import { createExecutionContext } from './types/context.js';
import type { IBrain } from './types/brain.js';

export class Gateway implements IGateway {
  private readonly middlewares: GatewayMiddleware[] = [];
  private readonly brain: IBrain;

  constructor(brain: IBrain, config?: GatewayConfig) {
    this.brain = brain;
    if (config?.middlewares) {
      this.middlewares.push(...config.middlewares);
    }
  }

  use(middleware: GatewayMiddleware): void {
    this.middlewares.push(middleware);
  }

  async process(input: GatewayInput): Promise<GatewayOutput> {
    const startTime = Date.now();
    const context = createExecutionContext(
      {
        source: input.source,
        ...input.metadata,
      },
      { inputType: input.type },
    );

    const handler = this.buildMiddlewareChain(input, context);

    try {
      return await handler();
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        traceId: context.message.traceId,
        duration: Date.now() - startTime,
      };
    }
  }

  private buildMiddlewareChain(
    input: GatewayInput,
    context: ExecutionContext,
  ): () => Promise<GatewayOutput> {
    const startTime = Date.now();

    let index = 0;

    const next = async (): Promise<GatewayOutput> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index]!;
        index++;
        return middleware(input, context, next);
      }

      // End of middleware chain: process with brain
      return this.processWithBrain(input, context, startTime);
    };

    return next;
  }

  private async processWithBrain(
    input: GatewayInput,
    context: ExecutionContext,
    startTime: number,
  ): Promise<GatewayOutput> {
    const response = await this.brain.execute({
      input: typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload),
      data: input.metadata,
    });

    return {
      success: true,
      data: response,
      traceId: context.message.traceId,
      duration: Date.now() - startTime,
    };
  }
}
