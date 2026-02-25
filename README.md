# Cerebro

**Open-source agentic framework for building Brain → Expert routing systems with composable pipelines.**

Cerebro provides a structured approach to multi-agent orchestration: a **Brain** that reasons about incoming requests using LLMs, routes them to specialized **Experts**, and composes their work through **Pipelines** — all communicating over a dual-mode **Bus** (in-process or distributed).

```
┌─────────────────────────────────────────────────┐
│                    Gateway                       │
│         (Single entry point for all I/O)         │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│                    Brain                         │
│  General knowledge + LLM reasoning + Routing     │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Knowledge │  │ LLM       │  │ Pipeline     │  │
│  │ (YAML+Vec)│  │ Provider  │  │ Orchestrator │  │
│  └──────────┘  └───────────┘  └──────────────┘  │
└────────┬────────────┬────────────┬──────────────┘
         │            │            │
    ┌────▼───┐  ┌─────▼────┐  ┌───▼──────┐
    │Expert A│  │Expert B  │  │Expert C  │  ...
    │(Claude)│  │(Mistral) │  │(GPT-4)   │
    └────────┘  └──────────┘  └──────────┘
         ▲            ▲            ▲
         └────────────┼────────────┘
              Communication Bus
        (EventEmitter local / Redis distributed)
```

## Features

- **Brain → Expert routing** — LLM-powered routing that reasons about which experts to invoke and in what pattern
- **Composable pipelines** — Fluent API for chain, parallel, conditional, and map compositions
- **Dual-mode bus** — EventEmitter for local (<1ms latency) or Redis for distributed deployments
- **Multi-LLM support** — Claude, OpenAI, Mistral, Gemini with per-agent provider configuration
- **Hybrid knowledge** — YAML (O(1) key lookup) + Vector DB for semantic search
- **Real-time sessions** — Bidirectional streaming for live interactions (phone calls, chat)
- **Framework-agnostic** — Core library works anywhere; optional NestJS adapter included
- **Observability** — Built-in tracing, metrics, pipeline traces, and circuit breakers
- **Type-safe** — Full TypeScript with strict mode, all pipeline compositions are type-checked

## Packages

| Package | Description |
|---------|-------------|
| [`@cerebro/core`](./packages/core) | Brain, Expert, Gateway, Pipeline builder/executor, types, observability |
| [`@cerebro/bus`](./packages/bus) | Communication bus — LocalBus (EventEmitter) + RedisBus + StreamSession |
| [`@cerebro/llm`](./packages/llm) | Multi-provider LLM abstraction (Claude, OpenAI, Mistral, Gemini) |
| [`@cerebro/knowledge`](./packages/knowledge) | Hybrid knowledge store — YAML loader + Vector DB adapter |
| [`@cerebro/nestjs`](./packages/nestjs) | Optional NestJS module adapter with decorators |

## Quick Start

### Installation

```bash
# Install all packages
pnpm add @cerebro/core @cerebro/bus @cerebro/llm @cerebro/knowledge

# Optional: NestJS adapter
pnpm add @cerebro/nestjs

# Install your LLM provider(s) of choice
pnpm add @anthropic-ai/sdk  # for Claude
pnpm add openai              # for OpenAI / Azure OpenAI
```

### Minimal Example

```typescript
import { LocalBus } from '@cerebro/bus';
import { Expert, Pipeline, PipelineExecutor, createExecutionContext } from '@cerebro/core';
import type { ExpertTask, ExpertResult, ExecutionContext } from '@cerebro/core';

// 1. Define an Expert
class ExtractorExpert extends Expert {
  readonly name = 'Extractor';
  readonly domain = 'documents';
  readonly capabilities = ['extract', 'parse'];

  async process(task: ExpertTask, context: ExecutionContext): Promise<ExpertResult> {
    // Your extraction logic here
    return {
      type: 'extraction',
      data: { vendor: 'Acme Corp', amount: 1500 },
      expertName: this.name,
    };
  }
}

class ClassifierExpert extends Expert {
  readonly name = 'Classifier';
  readonly domain = 'documents';
  readonly capabilities = ['classify'];

  async process(task: ExpertTask, context: ExecutionContext): Promise<ExpertResult> {
    const extraction = context.getStepResult<ExpertResult>('Extractor');
    return {
      type: 'classification',
      data: { category: 'financial', confidence: 0.95 },
      expertName: this.name,
    };
  }
}

// 2. Set up bus and register experts
const bus = new LocalBus();
const extractor = new ExtractorExpert();
const classifier = new ClassifierExpert();
extractor.register(bus);
classifier.register(bus);

// 3. Build and execute a pipeline
const pipeline = Pipeline.from('Extractor').then('Classifier').build();
const executor = new PipelineExecutor({ bus });
const context = createExecutionContext({ source: 'api' });

const { result, trace } = await executor.execute(pipeline, context);
console.log(result); // ClassifierExpert's output
console.log(trace);  // Full execution trace with per-step timing

await bus.destroy();
```

## Core Concepts

### Gateway

The single entry point for all I/O. Accepts typed input with source metadata, applies middleware (auth, rate limiting, logging), forwards to the Brain, and returns structured output.

```typescript
import { Gateway } from '@cerebro/core';

const gateway = new Gateway(brain, {
  middlewares: [
    async (input, context, next) => {
      console.log(`Request from ${input.source}`);
      const result = await next();
      console.log(`Response in ${result.duration}ms`);
      return result;
    },
  ],
});

const output = await gateway.process({
  type: 'query',
  source: 'whatsapp',
  payload: 'What is my account balance?',
  metadata: { userId: 'user-123' },
});
```

### Brain

The central orchestrator that uses an LLM to reason about incoming requests. It examines available experts and their capabilities, queries relevant knowledge, and decides the routing strategy.

```typescript
import { Brain } from '@cerebro/core';
import { ProviderRegistry, ClaudeProvider } from '@cerebro/llm';

const llmRegistry = new ProviderRegistry();
llmRegistry.register('claude', new ClaudeProvider({ apiKey: '...' }));

const brain = new Brain(
  { systemPrompt: 'You are a wealth management assistant.' },
  { bus, llmRegistry, knowledge },
);

brain.registerExpert({
  name: 'DocumentExtractor',
  domain: 'documents',
  capabilities: ['extract', 'ocr'],
});

const response = await brain.execute({
  input: 'Process this patrimony statement',
});
// Brain routes to appropriate experts automatically
```

### Expert

Experts are specialized agents that handle specific domains. Each expert declares its capabilities and registers on the bus for request-response communication.

```typescript
import { Expert } from '@cerebro/core';
import type { ExpertTask, ExpertResult, ExecutionContext } from '@cerebro/core';

class CustomerServiceExpert extends Expert {
  readonly name = 'CustomerService';
  readonly domain = 'communication';
  readonly capabilities = ['reply', 'notify', 'escalate'];
  readonly llmProvider = 'claude'; // Use Claude for this expert

  async process(task: ExpertTask, context: ExecutionContext): Promise<ExpertResult> {
    // Access results from previous pipeline steps
    const customerData = context.getStepResult('IntegrationExpert');

    // Use injected LLM if needed
    const response = await this.llm?.chat([
      { role: 'user', content: task.instruction },
    ]);

    return {
      type: 'response',
      data: { reply: response?.content },
      expertName: this.name,
    };
  }
}
```

### Pipeline Builder

Compose expert workflows using a fluent API. Pipelines are data structures — they can be serialized, visualized, and replayed.

```typescript
import { Pipeline } from '@cerebro/core';

// Chain: sequential execution
const chain = Pipeline.from('Extractor')
  .then('Classifier')
  .then('Formatter')
  .build();

// Parallel: concurrent execution with merge
const parallel = Pipeline.parallel(
  Pipeline.from('CustomerData'),
  Pipeline.from('Inventory'),
).merge().build();

// Conditional: branching based on context
const conditional = Pipeline.from('Classifier')
  .when(
    'Classifier.type == invoice',
    Pipeline.from('InvoiceProcessor'),
    Pipeline.from('GenericProcessor'),
  )
  .build();

// Nested composition
const complex = Pipeline.from('Classifier')
  .then(
    Pipeline.parallel(
      Pipeline.from('Enricher'),
      Pipeline.from('RiskAnalyzer'),
    ).merge(),
  )
  .then('Formatter')
  .build();

// Map: apply a step to each item in an array
const mapped = Pipeline.from('ListGenerator')
  .map('items', Pipeline.from('ItemProcessor'), 5) // max 5 concurrent
  .build();
```

### Communication Bus

Dual-mode bus for in-process or distributed communication.

```typescript
import { createBus, StreamSession } from '@cerebro/bus';

// Auto: tries Redis, falls back to local
const bus = createBus({ mode: 'auto' });

// Explicit local (EventEmitter, <1ms latency)
const localBus = createBus({ mode: 'local' });

// Publish / Subscribe
bus.subscribe('expert.*', (envelope) => {
  console.log(`Message on ${envelope.topic}:`, envelope.payload);
});
await bus.publish('expert.classifier', { type: 'classify' });

// Request / Response (with timeout)
const response = await bus.request('expert.classifier.request', {
  task: { instruction: 'Classify this document' },
}, { timeout: 5000 });

// StreamSession for real-time interactions
const session = new StreamSession(bus, {
  participants: ['CallingAgent', 'Brain', 'IntegrationExpert'],
  idleTimeout: 60_000,
});

// Sub-500ms round-trip during live calls
const balance = await session.ask('CallingAgent', 'Brain', {
  type: 'query',
  content: 'What is the due amount for customer #456?',
}, 500);
```

### Knowledge Store

Hybrid knowledge system: structured YAML for deterministic lookups, Vector DB for semantic search.

```yaml
# knowledge/documents.yaml
domain: documents
entries:
  - key: invoice
    description: "Commercial invoice for goods/services"
    fields: [vendor, date, amount, currency, lineItems, taxId]
    extractionHints: "Look for total amount, vendor name, date in header"
    relatedExperts: [DocumentExtractor]

  - key: patrimony_calculation
    description: "Fields needed to calculate patrimony"
    fields: [realEstate, securities, lifeInsurance, businessStakes, liabilities]
    relatedExperts: [archimede, dbExpert]
```

```typescript
import { HybridStore, loadYamlKnowledge } from '@cerebro/knowledge';

const domains = loadYamlKnowledge('./knowledge');
const store = new HybridStore({
  domains,
  vectorStore: myPgVectorAdapter, // optional
});

// O(1) exact lookup
const invoice = store.getEntry('documents', 'invoice');

// Text search (YAML first, then vector fallback)
const results = await store.search('patrimony calculation');

// Learn new knowledge dynamically
await store.learn({
  key: 'new-doc-type',
  domain: 'documents',
  description: 'Discovered during processing',
});
```

### LLM Providers

Unified interface for multiple LLM providers. Each Brain/Expert can use a different provider.

```typescript
import { ProviderRegistry, ClaudeProvider, OpenAIProvider } from '@cerebro/llm';

const registry = new ProviderRegistry();
registry.register('claude', new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
}));
registry.register('openai', new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
}));
registry.setDefault('claude');

// Use in Brain
const brain = new Brain({ llmProvider: 'claude' }, { bus, llmRegistry: registry });

// Streaming
const provider = registry.getOrThrow('claude');
for await (const chunk of provider.stream([
  { role: 'user', content: 'Explain quantum computing' },
])) {
  process.stdout.write(chunk.content ?? '');
}
```

Available providers:
- **`ClaudeProvider`** — Anthropic API (direct + Bedrock)
- **`OpenAIProvider`** — OpenAI API (+ Azure OpenAI)
- **`MistralProvider`** — Mistral AI
- **`GeminiProvider`** — Google Generative AI

### NestJS Integration

Optional adapter for NestJS applications.

```typescript
import { Module } from '@nestjs/common';
import { CerebroModule, CerebroExpert, CerebroService } from '@cerebro/nestjs';
import { ClaudeProvider } from '@cerebro/llm';

@Module({
  imports: [
    CerebroModule.forRoot({
      bus: { mode: 'auto' },
      brain: { systemPrompt: 'You are a CRM assistant.' },
      llmProviders: [
        { name: 'claude', provider: new ClaudeProvider({ apiKey: '...' }), default: true },
      ],
      knowledgePaths: ['./knowledge'],
    }),
  ],
})
export class AppModule {}

// Use the @CerebroExpert decorator
@CerebroExpert({
  name: 'CustomerService',
  domain: 'communication',
  capabilities: ['reply', 'notify'],
})
class CustomerServiceExpert extends Expert {
  constructor(private conversationService: ConversationService) {
    super();
  }

  async process(task: ExpertTask, ctx: ExecutionContext): Promise<ExpertResult> {
    // NestJS DI works normally
    const history = await this.conversationService.getHistory(ctx.message.sessionId);
    // ...
  }
}

// Inject CerebroService anywhere
@Injectable()
class MyService {
  constructor(private cerebro: CerebroService) {}

  async handleMessage(input: GatewayInput) {
    return this.cerebro.process(input);
  }
}
```

### Observability

Built-in metrics, tracing, and pipeline traces for production monitoring.

```typescript
import { InMemoryMetrics, InMemoryTracer, METRICS } from '@cerebro/core';

// Metrics
const metrics = new InMemoryMetrics();
metrics.increment(METRICS.BUS_MESSAGES_PUBLISHED, { topic: 'expert.classifier' });
metrics.histogram(METRICS.PIPELINE_DURATION, 150, { pipeline: 'extraction' });

const snapshot = metrics.snapshot();
// { counters: {...}, gauges: {...}, histograms: { ..., avg, p50, p99 } }

// Tracing
const tracer = new InMemoryTracer();
const span = tracer.startSpan('pipeline.execute', { traceId: context.message.traceId });
span.setAttribute('pipeline', 'document-processing');
span.addEvent('routing_complete');
// ... work ...
span.end();

// Pipeline traces (automatic)
const { trace } = await executor.execute(pipeline, context);
// trace.root contains full tree with per-step timing, status, attempts, errors
```

### Error Handling & Circuit Breakers

```typescript
import { PipelineExecutor, CircuitBreaker, Pipeline } from '@cerebro/core';

const executor = new PipelineExecutor({
  bus,
  defaultTimeout: 30_000,
  errorStrategy: {
    default: { type: 'retry', maxRetries: 3, delayMs: 1000 },
    perExpert: {
      SlowExpert: { type: 'retry', maxRetries: 5, delayMs: 2000 },
      OptionalExpert: { type: 'skip' }, // Skip on failure
      CriticalExpert: { type: 'abort' }, // Fail the pipeline
    },
  },
});

// Expert steps with fallback
const pipeline = Pipeline.from('PrimaryExpert', {
  timeout: 10_000,
  retries: 3,
  fallback: Pipeline.from('FallbackExpert').getStep(),
}).build();
```

Error categories:
- **`TRANSIENT`** — Retryable (network issues, temporary failures)
- **`PERMANENT`** — Non-retryable (invalid input, logic errors)
- **`RATE_LIMITED`** — Retryable with backoff
- **`CIRCUIT_OPEN`** — Expert temporarily unavailable

## Examples

The [`examples/`](./examples) directory contains working integration patterns:

| Example | Description |
|---------|-------------|
| [`basic`](./examples/basic) | Minimal standalone — LocalBus, two experts, chain pipeline, gateway |
| [`vendelo`](./examples/vendelo) | CRM agent — WhatsApp message → parallel(Integration + CustomerService) |
| [`louverdi`](./examples/louverdi) | Wealth management — Document → chain(Extract → Classify → Guidelines) |

Run an example:
```bash
pnpm --filter @cerebro/example-basic exec tsx src/index.ts
pnpm --filter @cerebro/example-vendelo exec tsx src/index.ts
pnpm --filter @cerebro/example-louverdi exec tsx src/index.ts
```

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Setup

```bash
git clone <repo-url>
cd cerebro
pnpm install
pnpm build
pnpm test
```

### Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages (via Turbo) |
| `pnpm test` | Run all tests (Vitest) |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format with Prettier |
| `pnpm clean` | Clean all build artifacts |

### Project Structure

```
cerebro/
├── packages/
│   ├── core/           # @cerebro/core
│   │   └── src/
│   │       ├── types/          # All type definitions
│   │       ├── pipeline/       # Builder, executor, error strategies
│   │       ├── context/        # Context carrier for serialization
│   │       ├── observability/  # Metrics, tracing
│   │       ├── brain.ts        # Brain orchestrator
│   │       ├── expert.ts       # Expert base class
│   │       └── gateway.ts      # Gateway entry point
│   ├── bus/            # @cerebro/bus
│   │   └── src/
│   │       ├── local-bus.ts       # EventEmitter implementation
│   │       ├── redis-bus.ts       # Redis Pub/Sub + Streams
│   │       ├── stream-session.ts  # Real-time bidirectional sessions
│   │       └── bus-factory.ts     # Auto/local/redis factory
│   ├── knowledge/      # @cerebro/knowledge
│   │   └── src/
│   │       ├── yaml-loader.ts  # Load .yaml knowledge files
│   │       └── hybrid-store.ts # YAML + Vector DB hybrid
│   ├── llm/            # @cerebro/llm
│   │   └── src/
│   │       ├── providers/      # Claude, OpenAI, Mistral, Gemini
│   │       └── registry.ts     # Provider registry with defaults
│   └── nestjs/         # @cerebro/nestjs
│       └── src/
│           ├── cerebro.module.ts   # forRoot / forRootAsync
│           ├── cerebro.service.ts  # Injectable gateway wrapper
│           └── decorators/         # @CerebroExpert, @CerebroBrain
├── examples/
│   ├── basic/          # Minimal standalone example
│   ├── vendelo/        # CRM agent integration
│   └── louverdi/       # Wealth management integration
├── turbo.json          # Turbo build pipeline
├── vitest.workspace.ts # Vitest workspace config
└── tsconfig.base.json  # Shared TypeScript config
```

### Tech Stack

- **TypeScript** — Strict mode, ES2022 target
- **pnpm** workspaces + **Turbo** — Monorepo management
- **tsup** — ESM + CJS dual output builds
- **Vitest** — Test runner
- **ioredis** — Redis client (optional peer dependency)

## Design Decisions

1. **Framework-agnostic core** with optional NestJS adapter — not locked to any framework
2. **EventEmitter for real-time** (<1ms) + Redis for distributed — both available, auto-detect
3. **Pipeline as data structure** — can be serialized, visualized, replayed, composed
4. **Brain uses LLM for routing** — not hardcoded rules; the Brain reasons about which experts to invoke
5. **Experts auto-register on bus** — plug-and-play; add an expert and the Brain discovers it
6. **Per-agent LLM config** — each expert/brain picks its own provider; falls back to default
7. **YAML knowledge first** — simple, git-versioned, auditable; Vector DB for dynamic knowledge
8. **Context propagation** — traceId, tenantId, sessionId, pipeline state flow through every step

## License

MIT
