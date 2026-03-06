import { describe, it, expect } from 'vitest';
import { LocalBus } from '@denniszelada/cerebro-bus';
import { Pipeline } from '../pipeline/builder.js';
import { PipelineExecutor } from '../pipeline/executor.js';
import { createExecutionContext } from '../types/context.js';
import type { ExpertResult, ExpertTask } from '../types/expert.js';

function setupMockExpert(
  bus: LocalBus,
  name: string,
  handler: (task: ExpertTask) => ExpertResult,
) {
  bus.subscribe(`expert.${name}.request`, async (envelope) => {
    const { task } = envelope.payload as { task: ExpertTask };
    const replyTo = envelope.metadata?.['replyTo'] as string;
    const result = handler(task);
    if (replyTo) {
      await bus.publish(replyTo, result, {
        correlationId: envelope.correlationId,
      });
    }
  });
}

describe('PipelineExecutor', () => {
  it('should execute a single expert step', async () => {
    const bus = new LocalBus();
    const executor = new PipelineExecutor({ bus });
    const context = createExecutionContext();

    setupMockExpert(bus, 'Extractor', (task) => ({
      type: 'extraction',
      data: { extracted: true, taskId: task.id },
      expertName: 'Extractor',
    }));

    const pipeline = Pipeline.from('Extractor').build();
    const { result, trace } = await executor.execute(pipeline, context);

    expect(trace.status).toBe('completed');
    expect((result as ExpertResult).data).toEqual(
      expect.objectContaining({ extracted: true }),
    );

    await bus.destroy();
  });

  it('should execute a chain of experts', async () => {
    const bus = new LocalBus();
    const executor = new PipelineExecutor({ bus });
    const context = createExecutionContext();

    setupMockExpert(bus, 'Step1', () => ({
      type: 'step1',
      data: { step: 1 },
      expertName: 'Step1',
    }));

    setupMockExpert(bus, 'Step2', () => ({
      type: 'step2',
      data: { step: 2 },
      expertName: 'Step2',
    }));

    const pipeline = Pipeline.from('Step1').then('Step2').build();
    const { result, trace } = await executor.execute(pipeline, context);

    expect(trace.status).toBe('completed');
    expect((result as ExpertResult).data).toEqual({ step: 2 });

    // Both steps should have results in context
    expect(context.getStepResult('Step1')).toBeDefined();
    expect(context.getStepResult('Step2')).toBeDefined();

    await bus.destroy();
  });

  it('should execute parallel steps', async () => {
    const bus = new LocalBus();
    const executor = new PipelineExecutor({ bus });
    const context = createExecutionContext();

    setupMockExpert(bus, 'A', () => ({
      type: 'a',
      data: { from: 'A' },
      expertName: 'A',
    }));

    setupMockExpert(bus, 'B', () => ({
      type: 'b',
      data: { from: 'B' },
      expertName: 'B',
    }));

    const pipeline = Pipeline.parallel(
      Pipeline.from('A'),
      Pipeline.from('B'),
    ).build();

    const { result, trace } = await executor.execute(pipeline, context);

    expect(trace.status).toBe('completed');
    expect(Array.isArray(result)).toBe(true);
    expect((result as ExpertResult[]).length).toBe(2);

    await bus.destroy();
  });

  it('should execute conditional steps', async () => {
    const bus = new LocalBus();
    const executor = new PipelineExecutor({ bus });
    const context = createExecutionContext();

    // Set up a result that the condition will check
    context.setStepResult('type', 'invoice');

    setupMockExpert(bus, 'InvoiceProcessor', () => ({
      type: 'invoice',
      data: { processed: 'invoice' },
      expertName: 'InvoiceProcessor',
    }));

    setupMockExpert(bus, 'GenericProcessor', () => ({
      type: 'generic',
      data: { processed: 'generic' },
      expertName: 'GenericProcessor',
    }));

    const pipeline = Pipeline.from('_')
      .when('type == invoice', Pipeline.from('InvoiceProcessor'), Pipeline.from('GenericProcessor'))
      .build();

    // Need to set up the first step too
    setupMockExpert(bus, '_', () => ({
      type: 'noop',
      data: {},
      expertName: '_',
    }));

    const { trace } = await executor.execute(pipeline, context);
    expect(trace.status).toBe('completed');

    await bus.destroy();
  });

  it('should handle expert timeout', async () => {
    const bus = new LocalBus();
    const executor = new PipelineExecutor({ bus, defaultTimeout: 100 });
    const context = createExecutionContext();

    // No expert registered - will timeout

    const pipeline = Pipeline.from('NonExistent').build();
    const { trace } = await executor.execute(pipeline, context);

    expect(trace.status).toBe('failed');
    expect(trace.root.error).toContain('timeout');

    await bus.destroy();
  });

  it('should provide execution trace with timing', async () => {
    const bus = new LocalBus();
    const executor = new PipelineExecutor({ bus });
    const context = createExecutionContext();

    setupMockExpert(bus, 'Fast', () => ({
      type: 'fast',
      data: { speed: 'fast' },
      expertName: 'Fast',
    }));

    const pipeline = Pipeline.from('Fast').build();
    const { trace } = await executor.execute(pipeline, context);

    expect(trace.pipelineId).toBeDefined();
    expect(trace.startedAt).toBeDefined();
    expect(trace.completedAt).toBeDefined();
    expect(trace.duration).toBeGreaterThanOrEqual(0);
    expect(trace.root.stepType).toBe('expert');
    expect(trace.root.attempts).toBe(1);

    await bus.destroy();
  });
});
