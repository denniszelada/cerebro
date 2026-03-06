/**
 * Cerebro Basic Example
 *
 * Demonstrates a minimal setup with:
 * - LocalBus for in-process communication
 * - Two mock experts (Extractor + Classifier)
 * - Pipeline: Extractor → Classifier (chain)
 * - Gateway processing a request
 */

import { LocalBus, StreamSession } from '@denniszelada/cerebro-bus';
import {
  Expert,
  Pipeline,
  PipelineExecutor,
  Gateway,
  Brain,
  createExecutionContext,
} from '@denniszelada/cerebro-core';
import type { ExpertTask, ExpertResult, ExecutionContext } from '@denniszelada/cerebro-core';
import { ProviderRegistry } from '@denniszelada/cerebro-llm';
import type { ILLMProvider, LLMMessage, LLMOptions, LLMResponse, LLMChunk } from '@denniszelada/cerebro-llm';
import { HybridStore, loadYamlKnowledge } from '@denniszelada/cerebro-knowledge';

// ─── Mock LLM Provider ──────────────────────────────────────────────────────
// In production, replace with ClaudeProvider, OpenAIProvider, etc.
class MockLLMProvider implements ILLMProvider {
  readonly name = 'mock';
  readonly supportsTools = false;

  async chat(messages: LLMMessage[], _options?: LLMOptions): Promise<LLMResponse> {
    const lastMessage = messages[messages.length - 1]?.content ?? '';

    // Simulate Brain routing logic
    if (lastMessage.includes('Available experts')) {
      return {
        content: JSON.stringify({
          strategy: 'chain',
          steps: [
            { expertId: 'Extractor', task: 'Extract data from the document' },
            { expertId: 'Classifier', task: 'Classify the extracted data' },
          ],
          reasoning: 'Document needs extraction then classification',
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'mock-model',
        finishReason: 'stop',
      };
    }

    return {
      content: 'Mock response',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'mock-model',
      finishReason: 'stop',
    };
  }

  async *stream(_messages: LLMMessage[]): AsyncIterable<LLMChunk> {
    yield { content: 'Mock stream' };
    yield { finishReason: 'stop' };
  }
}

// ─── Expert Implementations ──────────────────────────────────────────────────

class ExtractorExpert extends Expert {
  readonly name = 'Extractor';
  readonly domain = 'documents';
  readonly capabilities = ['extract', 'parse'];
  readonly description = 'Extracts structured data from documents';

  async process(task: ExpertTask, _context: ExecutionContext): Promise<ExpertResult> {
    console.log(`[Extractor] Processing: ${task.instruction}`);

    // Simulate extraction
    return {
      type: 'extraction',
      data: {
        documentType: 'invoice',
        vendor: 'Acme Corp',
        amount: 1500.0,
        currency: 'EUR',
        date: '2026-02-25',
      },
      expertName: this.name,
      duration: 150,
    };
  }
}

class ClassifierExpert extends Expert {
  readonly name = 'Classifier';
  readonly domain = 'documents';
  readonly capabilities = ['classify', 'categorize'];
  readonly description = 'Classifies documents by type and urgency';

  async process(task: ExpertTask, context: ExecutionContext): Promise<ExpertResult> {
    console.log(`[Classifier] Processing: ${task.instruction}`);

    // Use data from previous step
    const extraction = context.getStepResult<ExpertResult>('Extractor');
    const extractedData = extraction?.data as Record<string, unknown> | undefined;

    return {
      type: 'classification',
      data: {
        category: 'financial',
        subcategory: extractedData?.documentType ?? 'unknown',
        urgency: 'normal',
        confidence: 0.95,
      },
      expertName: this.name,
      duration: 80,
    };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Cerebro Basic Example ===\n');

  // 1. Create the bus
  const bus = new LocalBus();
  console.log('✓ LocalBus created');

  // 2. Set up LLM registry
  const llmRegistry = new ProviderRegistry();
  llmRegistry.register('mock', new MockLLMProvider());
  console.log('✓ LLM Registry configured with MockProvider');

  // 3. Set up knowledge store
  const knowledge = new HybridStore();
  await knowledge.learn({
    key: 'invoice',
    domain: 'documents',
    description: 'Commercial invoice for goods/services',
    fields: ['vendor', 'date', 'amount', 'currency'],
  });
  console.log('✓ Knowledge store initialized');

  // 4. Create and register experts
  const extractor = new ExtractorExpert();
  const classifier = new ClassifierExpert();
  extractor.register(bus);
  classifier.register(bus);
  console.log('✓ Experts registered (Extractor, Classifier)');

  // 5. Create the Brain
  const brain = new Brain({}, { bus, llmRegistry, knowledge });
  brain.registerExpert(extractor.getRegistration());
  brain.registerExpert(classifier.getRegistration());
  console.log('✓ Brain created with 2 experts');

  // 6. Create the Gateway
  const gateway = new Gateway(brain, {
    middlewares: [
      async (input, _ctx, next) => {
        console.log(`\n→ Gateway received: ${input.type} from ${input.source}`);
        const result = await next();
        console.log(`← Gateway responding (${result.duration}ms)`);
        return result;
      },
    ],
  });
  console.log('✓ Gateway created with logging middleware');

  // 7. Process a request
  console.log('\n--- Processing Request ---');
  const output = await gateway.process({
    type: 'document',
    source: 'api',
    payload: 'Process this invoice from Acme Corp for €1500',
    metadata: { userId: 'user-123' },
  });

  console.log('\n--- Result ---');
  console.log('Success:', output.success);
  console.log('Trace ID:', output.traceId);
  console.log('Duration:', output.duration, 'ms');
  console.log('Data:', JSON.stringify(output.data, null, 2));

  // 8. Demonstrate Pipeline Builder directly
  console.log('\n--- Pipeline Builder Demo ---');
  const pipeline = Pipeline.from('Extractor')
    .then('Classifier')
    .build('ExtractAndClassify');

  console.log('Pipeline:', pipeline.name);
  console.log('Root type:', pipeline.root.type);
  if (pipeline.root.type === 'chain') {
    console.log('Steps:', pipeline.root.steps.length);
  }

  // Execute pipeline directly
  const executor = new PipelineExecutor({ bus });
  const context = createExecutionContext({ source: 'demo' });
  const { result, trace } = await executor.execute(pipeline, context);
  console.log('\nPipeline result:', JSON.stringify(result, null, 2));
  console.log('Pipeline trace status:', trace.status);
  console.log('Pipeline duration:', trace.duration, 'ms');

  // 9. Demonstrate StreamSession
  console.log('\n--- StreamSession Demo ---');
  const session = new StreamSession(bus, {
    participants: ['Agent', 'Brain'],
    idleTimeout: 5000,
  });
  console.log('Session created with participants: Agent, Brain');

  // Listen for messages as Agent
  const agentMessages: unknown[] = [];
  const listener = session.listen('Agent');
  (async () => {
    for await (const msg of { [Symbol.asyncIterator]() { return listener; } }) {
      if (msg === undefined) break;
      agentMessages.push(msg);
    }
  })();

  await session.send('Brain', 'Agent', { type: 'greeting', text: 'Hello Agent!' });
  await new Promise((r) => setTimeout(r, 50));
  console.log('Agent received:', agentMessages.length, 'messages');

  await session.close();
  console.log('Session closed');

  // Cleanup
  await bus.destroy();
  console.log('\n✓ Cleanup complete');
}

main().catch(console.error);
