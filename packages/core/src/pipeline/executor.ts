import type { IBus } from '@cerebro/bus';
import type { ExecutionContext } from '../types/context.js';
import type { ExpertResult } from '../types/expert.js';
import type {
  PipelineDefinition,
  PipelineStep,
  PipelineTrace,
  StepTrace,
} from '../types/pipeline.js';
import { CerebroError, PipelineError } from '../types/errors.js';
import {
  CircuitBreaker,
  getEffectiveStrategy,
  getRetryDelay,
  shouldRetry,
  type ErrorStrategyConfig,
} from './error-strategy.js';

export interface PipelineExecutorConfig {
  bus: IBus;
  defaultTimeout?: number;
  errorStrategy?: ErrorStrategyConfig;
  conditionEvaluator?: (condition: string, context: ExecutionContext) => boolean;
}

export class PipelineExecutor {
  private readonly bus: IBus;
  private readonly defaultTimeout: number;
  private readonly errorStrategy?: ErrorStrategyConfig;
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly conditionEvaluator: (condition: string, context: ExecutionContext) => boolean;

  constructor(config: PipelineExecutorConfig) {
    this.bus = config.bus;
    this.defaultTimeout = config.defaultTimeout ?? 30_000;
    this.errorStrategy = config.errorStrategy;
    this.conditionEvaluator = config.conditionEvaluator ?? defaultConditionEvaluator;
  }

  async execute(
    pipeline: PipelineDefinition,
    context: ExecutionContext,
  ): Promise<{ result: unknown; trace: PipelineTrace }> {
    const startedAt = Date.now();
    const rootTrace = this.createStepTrace(pipeline.root);

    try {
      const result = await this.executeStep(pipeline.root, context, rootTrace);
      rootTrace.status = 'completed';
      rootTrace.completedAt = Date.now();
      rootTrace.duration = Date.now() - (rootTrace.startedAt ?? startedAt);

      return {
        result,
        trace: {
          pipelineId: pipeline.id,
          status: 'completed',
          startedAt,
          completedAt: Date.now(),
          duration: Date.now() - startedAt,
          root: rootTrace,
        },
      };
    } catch (error) {
      rootTrace.status = 'failed';
      rootTrace.error = (error as Error).message;
      rootTrace.completedAt = Date.now();
      rootTrace.duration = Date.now() - (rootTrace.startedAt ?? startedAt);

      return {
        result: undefined,
        trace: {
          pipelineId: pipeline.id,
          status: 'failed',
          startedAt,
          completedAt: Date.now(),
          duration: Date.now() - startedAt,
          root: rootTrace,
        },
      };
    }
  }

  private async executeStep(
    step: PipelineStep,
    context: ExecutionContext,
    trace: StepTrace,
  ): Promise<unknown> {
    trace.status = 'running';
    trace.startedAt = Date.now();

    switch (step.type) {
      case 'expert':
        return this.executeExpertStep(step, context, trace);
      case 'chain':
        return this.executeChainStep(step, context, trace);
      case 'parallel':
        return this.executeParallelStep(step, context, trace);
      case 'conditional':
        return this.executeConditionalStep(step, context, trace);
      case 'map':
        return this.executeMapStep(step, context, trace);
    }
  }

  private async executeExpertStep(
    step: Extract<PipelineStep, { type: 'expert' }>,
    context: ExecutionContext,
    trace: StepTrace,
  ): Promise<unknown> {
    const strategy = getEffectiveStrategy(step.expertName, this.errorStrategy);

    // Check circuit breaker
    const cb = this.getCircuitBreaker(step.expertName);
    if (cb.isOpen) {
      if (step.fallback) {
        const fallbackTrace = this.createStepTrace(step.fallback);
        trace.children = [fallbackTrace];
        return this.executeStep(step.fallback, context, fallbackTrace);
      }
      throw new CerebroError(`Circuit open for expert "${step.expertName}"`, {
        category: 'CIRCUIT_OPEN' as never,
        code: 'CIRCUIT_OPEN',
      });
    }

    let lastError: Error | undefined;
    const maxAttempts = (strategy.maxRetries ?? 0) + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      trace.attempts = attempt + 1;
      try {
        const topic = `expert.${step.expertName}.request`;
        const timeout = step.timeout ?? this.defaultTimeout;

        const response = await this.bus.request<unknown, ExpertResult>(
          topic,
          {
            task: {
              id: step.id,
              instruction: step.instruction ?? '',
              data: context.toJSON(),
            },
            context: context.toJSON(),
          },
          { timeout },
        );

        const result = response.payload;

        if (result.type === 'error') {
          throw new PipelineError(step.id, `Expert "${step.expertName}" returned error: ${JSON.stringify(result.data)}`);
        }

        context.setStepResult(step.id, result);
        context.setStepResult(step.expertName, result);
        cb.recordSuccess();

        trace.status = 'completed';
        trace.result = result;
        trace.completedAt = Date.now();
        trace.duration = Date.now() - (trace.startedAt ?? 0);

        return result;
      } catch (error) {
        lastError = error as Error;
        cb.recordFailure();

        if (shouldRetry(error, strategy, attempt) && attempt < maxAttempts - 1) {
          const delay = getRetryDelay(strategy, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        break;
      }
    }

    // All retries exhausted
    if (strategy.type === 'fallback' && step.fallback) {
      const fallbackTrace = this.createStepTrace(step.fallback);
      trace.children = [fallbackTrace];
      return this.executeStep(step.fallback, context, fallbackTrace);
    }

    if (strategy.type === 'skip') {
      trace.status = 'skipped';
      trace.error = lastError?.message;
      return undefined;
    }

    trace.status = 'failed';
    trace.error = lastError?.message;
    throw lastError ?? new PipelineError(step.id, `Expert "${step.expertName}" failed`);
  }

  private async executeChainStep(
    step: Extract<PipelineStep, { type: 'chain' }>,
    context: ExecutionContext,
    trace: StepTrace,
  ): Promise<unknown> {
    trace.children = step.steps.map((s) => this.createStepTrace(s));
    let lastResult: unknown;

    for (let i = 0; i < step.steps.length; i++) {
      const childStep = step.steps[i]!;
      const childTrace = trace.children[i]!;
      lastResult = await this.executeStep(childStep, context, childTrace);
    }

    trace.status = 'completed';
    trace.result = lastResult;
    trace.completedAt = Date.now();
    trace.duration = Date.now() - (trace.startedAt ?? 0);
    return lastResult;
  }

  private async executeParallelStep(
    step: Extract<PipelineStep, { type: 'parallel' }>,
    context: ExecutionContext,
    trace: StepTrace,
  ): Promise<unknown> {
    trace.children = step.steps.map((s) => this.createStepTrace(s));

    const results = await Promise.all(
      step.steps.map((childStep, i) => {
        const forkedCtx = context.fork();
        return this.executeStep(childStep, forkedCtx, trace.children![i]!);
      }),
    );

    trace.status = 'completed';
    trace.result = results;
    trace.completedAt = Date.now();
    trace.duration = Date.now() - (trace.startedAt ?? 0);

    // Store parallel results in context
    context.setStepResult(step.id, results);
    return results;
  }

  private async executeConditionalStep(
    step: Extract<PipelineStep, { type: 'conditional' }>,
    context: ExecutionContext,
    trace: StepTrace,
  ): Promise<unknown> {
    const conditionResult = this.conditionEvaluator(step.condition, context);

    const branch = conditionResult ? step.onTrue : step.onFalse;
    if (!branch) {
      trace.status = 'skipped';
      return undefined;
    }

    const branchTrace = this.createStepTrace(branch);
    trace.children = [branchTrace];
    const result = await this.executeStep(branch, context, branchTrace);

    trace.status = 'completed';
    trace.result = result;
    trace.completedAt = Date.now();
    trace.duration = Date.now() - (trace.startedAt ?? 0);
    return result;
  }

  private async executeMapStep(
    step: Extract<PipelineStep, { type: 'map' }>,
    context: ExecutionContext,
    trace: StepTrace,
  ): Promise<unknown> {
    const source = context.getStepResult<unknown[]>(step.sourceKey);
    if (!Array.isArray(source)) {
      throw new PipelineError(step.id, `Map source "${step.sourceKey}" is not an array`);
    }

    const concurrency = step.maxConcurrency ?? source.length;
    const results: unknown[] = [];
    trace.children = [];

    for (let i = 0; i < source.length; i += concurrency) {
      const batch = source.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((item, j) => {
          const childCtx = context.fork();
          childCtx.setStepResult('__mapItem', item);
          childCtx.setStepResult('__mapIndex', i + j);
          const childTrace = this.createStepTrace(step.step);
          trace.children!.push(childTrace);
          return this.executeStep(step.step, childCtx, childTrace);
        }),
      );
      results.push(...batchResults);
    }

    trace.status = 'completed';
    trace.result = results;
    trace.completedAt = Date.now();
    trace.duration = Date.now() - (trace.startedAt ?? 0);
    context.setStepResult(step.id, results);
    return results;
  }

  private createStepTrace(step: PipelineStep): StepTrace {
    return {
      stepId: step.id,
      stepType: step.type,
      expertName: step.type === 'expert' ? step.expertName : undefined,
      status: 'pending',
      attempts: 0,
    };
  }

  private getCircuitBreaker(expertName: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(expertName);
    if (!cb) {
      cb = new CircuitBreaker();
      this.circuitBreakers.set(expertName, cb);
    }
    return cb;
  }
}

function defaultConditionEvaluator(condition: string, context: ExecutionContext): boolean {
  // Simple evaluator: check if a step result exists and is truthy
  // Format: "stepId.field == value" or just "stepId" (truthy check)
  const parts = condition.split('==').map((s) => s.trim());
  if (parts.length === 2) {
    const [path, expected] = parts as [string, string];
    const pathParts = path.split('.');
    let value: unknown = context.getStepResult(pathParts[0]!);
    for (let i = 1; i < pathParts.length; i++) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[pathParts[i]!];
      } else {
        value = undefined;
      }
    }
    return String(value) === expected;
  }

  return !!context.getStepResult(condition);
}
