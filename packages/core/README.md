# @cerebro/core

Brain orchestrator, Expert base class, Gateway entry point, Pipeline builder/executor, observability, context propagation, and error handling for the Cerebro agentic framework.

## Install

```bash
pnpm add @cerebro/core
```

## Key Exports

| Export | Purpose |
|---|---|
| `Brain` | Routes requests to experts via LLM-powered decisions |
| `Expert` | Abstract base class for domain experts |
| `Gateway` | Entry point with middleware support |
| `Pipeline` | Fluent builder for chained/parallel execution flows |
| `PipelineExecutor` | Runs pipeline definitions over the bus |
| `CircuitBreaker` | Error strategy with configurable thresholds |
| `ContextCarrier` | Propagates traceId, spanId, sessionId across steps |
| `InMemoryMetrics` / `InMemoryTracer` | Built-in observability collectors |

## Usage

```ts
import { Brain, Expert, Gateway, Pipeline } from '@cerebro/core';
import { createBus } from '@cerebro/bus';
import { ProviderRegistry } from '@cerebro/llm';

// 1. Define an expert
class SummaryExpert extends Expert {
  name = 'summary';
  domain = 'text';
  capabilities = ['summarize', 'condense'];

  async process(task, context) {
    const result = await this.llm!.chat([
      { role: 'user', content: `Summarize: ${task.instruction}` },
    ]);
    return { type: 'text', data: result.content, expertName: this.name };
  }
}

// 2. Wire up Brain + Gateway
const bus = createBus({ mode: 'local' });
const registry = new ProviderRegistry();
// registry.register('claude', myClaudeProvider);

const brain = new Brain({ name: 'my-brain' }, { bus, llmRegistry: registry });
const expert = new SummaryExpert();
brain.registerExpert(expert.getRegistration());
expert.register(bus);

const gateway = new Gateway(brain);

// 3. Process a request
const output = await gateway.process({
  type: 'text',
  payload: 'Summarize the quarterly report',
  source: 'api',
});
```

### Pipeline builder

```ts
const pipeline = Pipeline.from('research', { instruction: 'gather data' })
  .then(Pipeline.from('summary', { instruction: 'summarize findings' }))
  .build('research-and-summarize');

// Or run experts in parallel
const parallel = Pipeline.parallel(
  Pipeline.from('translate', { instruction: 'translate to French' }),
  Pipeline.from('translate', { instruction: 'translate to Spanish' }),
).merge().build('multi-translate');
```

## More Info

See the [main Cerebro README](../../README.md) for full documentation.
