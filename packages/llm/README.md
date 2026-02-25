# @cerebro/llm

Multi-provider LLM abstraction for the Cerebro framework. Ships a common `ILLMProvider` interface, a `ProviderRegistry` for managing named providers, and built-in implementations for Claude, OpenAI, Mistral, and Gemini. All provider SDKs are optional peer dependencies -- install only what you use.

## Install

```bash
pnpm add @cerebro/llm

# Then install the SDK(s) you need:
pnpm add @anthropic-ai/sdk          # Claude
pnpm add openai                      # OpenAI / Azure OpenAI
pnpm add @mistralai/mistralai        # Mistral
pnpm add @google/generative-ai       # Gemini
```

## Key Exports

| Export | Purpose |
|---|---|
| `ILLMProvider` | Common interface (`chat`, `stream`) |
| `ProviderRegistry` | Register, retrieve, and set a default provider by name |
| `ClaudeProvider` | Anthropic Claude (direct API or Bedrock) |
| `OpenAIProvider` | OpenAI and Azure OpenAI |
| `MistralProvider` | Mistral AI |
| `GeminiProvider` | Google Gemini |

## Usage

```ts
import { ProviderRegistry, ClaudeProvider, OpenAIProvider } from '@cerebro/llm';

const registry = new ProviderRegistry();

registry.register('claude', new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-20250514',
}));

registry.register('openai', new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o',
}));

registry.setDefault('claude');

// Use the default provider
const llm = registry.getDefault();
const response = await llm.chat([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Explain monorepos in one sentence.' },
]);

console.log(response.content);
```

### Switching providers at runtime

```ts
const provider = registry.getOrThrow('openai');
const res = await provider.chat(messages, { temperature: 0.7 });
```

## More Info

See the [main Cerebro README](../../README.md) for full documentation.
