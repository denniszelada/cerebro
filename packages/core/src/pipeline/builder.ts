import { randomUUID } from 'node:crypto';
import type {
  ConditionalStep,
  ExpertStep,
  MapStep,
  PipelineDefinition,
  PipelineStep,
} from '../types/pipeline.js';

export class Pipeline {
  private constructor(private readonly step: PipelineStep) {}

  static from(expertName: string, options?: Partial<ExpertStep>): Pipeline {
    return new Pipeline({
      type: 'expert',
      id: options?.id ?? `expert-${expertName}-${randomUUID().slice(0, 8)}`,
      expertName,
      instruction: options?.instruction,
      timeout: options?.timeout,
      retries: options?.retries,
      fallback: options?.fallback,
    });
  }

  static parallel(...pipelines: Pipeline[]): Pipeline {
    return new Pipeline({
      type: 'parallel',
      id: `parallel-${randomUUID().slice(0, 8)}`,
      steps: pipelines.map((p) => p.step),
    });
  }

  then(next: Pipeline | string): Pipeline {
    const nextStep = typeof next === 'string' ? Pipeline.from(next).step : next.step;

    if (this.step.type === 'chain') {
      return new Pipeline({
        ...this.step,
        steps: [...this.step.steps, nextStep],
      });
    }

    return new Pipeline({
      type: 'chain',
      id: `chain-${randomUUID().slice(0, 8)}`,
      steps: [this.step, nextStep],
    });
  }

  merge(mergeId?: string): Pipeline {
    if (this.step.type !== 'parallel') {
      return this;
    }
    return new Pipeline({
      ...this.step,
      merge: mergeId ?? `merge-${randomUUID().slice(0, 8)}`,
    });
  }

  when(
    condition: string,
    onTrue: Pipeline | string,
    onFalse?: Pipeline | string,
  ): Pipeline {
    const trueStep = typeof onTrue === 'string' ? Pipeline.from(onTrue).step : onTrue.step;
    const falseStep = onFalse
      ? typeof onFalse === 'string'
        ? Pipeline.from(onFalse).step
        : onFalse.step
      : undefined;

    const conditionalStep: ConditionalStep = {
      type: 'conditional',
      id: `cond-${randomUUID().slice(0, 8)}`,
      condition,
      onTrue: trueStep,
      onFalse: falseStep,
    };

    if (this.step.type === 'chain') {
      return new Pipeline({
        ...this.step,
        steps: [...this.step.steps, conditionalStep],
      });
    }

    return new Pipeline({
      type: 'chain',
      id: `chain-${randomUUID().slice(0, 8)}`,
      steps: [this.step, conditionalStep],
    });
  }

  map(sourceKey: string, step: Pipeline | string, maxConcurrency?: number): Pipeline {
    const innerStep = typeof step === 'string' ? Pipeline.from(step).step : step.step;

    const mapStep: MapStep = {
      type: 'map',
      id: `map-${randomUUID().slice(0, 8)}`,
      sourceKey,
      step: innerStep,
      maxConcurrency,
    };

    if (this.step.type === 'chain') {
      return new Pipeline({
        ...this.step,
        steps: [...this.step.steps, mapStep],
      });
    }

    return new Pipeline({
      type: 'chain',
      id: `chain-${randomUUID().slice(0, 8)}`,
      steps: [this.step, mapStep],
    });
  }

  build(name?: string): PipelineDefinition {
    return {
      id: randomUUID(),
      name,
      root: this.step,
    };
  }

  getStep(): PipelineStep {
    return this.step;
  }
}
