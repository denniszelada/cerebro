# @cerebro/knowledge

Hybrid knowledge store for the Cerebro framework. Loads structured knowledge from YAML files, exposes an `IVectorStore` adapter interface for vector databases, and combines both via `HybridStore` -- O(1) key lookup in YAML first, then fallback to vector similarity search.

## Install

```bash
pnpm add @cerebro/knowledge
```

## Key Exports

| Export | Purpose |
|---|---|
| `HybridStore` | Combined YAML + vector store with automatic fallback |
| `loadYamlKnowledge()` | Load all `.yaml`/`.yml` files from a directory |
| `loadYamlFile()` | Load a single YAML knowledge file |
| `IKnowledgeStore` | Store interface (`query`, `search`, `learn`) |
| `IVectorStore` | Adapter interface for plugging in any vector DB |

## Usage

### YAML-only (no vector DB)

```ts
import { HybridStore, loadYamlKnowledge } from '@cerebro/knowledge';

const domains = loadYamlKnowledge('./knowledge');
const store = new HybridStore({ domains });

// Exact key lookup -- O(1)
const entry = store.getEntry('billing', 'refund-policy');

// Text search across all domains
const results = await store.search('How do refunds work?', { limit: 5 });
```

### YAML knowledge file format

```yaml
# knowledge/billing.yaml
domain: billing
description: Billing and payment rules
entries:
  - key: refund-policy
    description: Full refund within 30 days of purchase
    fields: ['refund', 'return', 'money back']
  - key: payment-methods
    description: We accept Visa, Mastercard, and ACH
    fields: ['credit card', 'payment', 'ACH']
```

### With a vector store (hybrid mode)

```ts
import { HybridStore } from '@cerebro/knowledge';

const store = new HybridStore({
  domains: loadYamlKnowledge('./knowledge'),
  vectorStore: myPineconeAdapter, // implements IVectorStore
});

// Searches YAML first, falls back to vector similarity
const results = await store.search('edge-case billing question');

// Learn new knowledge at runtime (persists to vector store)
await store.learn({
  key: 'new-policy',
  domain: 'billing',
  description: 'New 60-day return window for premium members',
});
```

## More Info

See the [main Cerebro README](../../README.md) for full documentation.
