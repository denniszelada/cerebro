import type { ExecutionContext, MessageContext } from '../types/context.js';
import { createExecutionContext } from '../types/context.js';

export class ContextCarrier {
  static serialize(context: ExecutionContext): string {
    return JSON.stringify(context.toJSON());
  }

  static deserialize(data: string): ExecutionContext {
    const parsed = JSON.parse(data) as {
      message: MessageContext;
      metadata: Record<string, unknown>;
      stepResults: Record<string, unknown>;
    };

    const ctx = createExecutionContext(parsed.message, parsed.metadata);

    if (parsed.stepResults) {
      for (const [key, value] of Object.entries(parsed.stepResults)) {
        ctx.setStepResult(key, value);
      }
    }

    return ctx;
  }

  static fork(
    context: ExecutionContext,
    overrides?: Partial<MessageContext>,
  ): ExecutionContext {
    return context.fork(overrides);
  }
}
