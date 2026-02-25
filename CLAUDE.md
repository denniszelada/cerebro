# Cerebro - Agentic Framework

## Project Structure
Monorepo with pnpm workspaces + Turbo. Packages under `packages/`, examples under `examples/`.

## Packages
- `@cerebro/core` - Brain, Expert, Gateway, Pipeline builder/executor, core types
- `@cerebro/bus` - Communication bus (LocalBus EventEmitter + RedisBus)
- `@cerebro/knowledge` - YAML knowledge loader + Vector DB adapter + HybridStore
- `@cerebro/llm` - Multi-provider LLM abstraction (Claude, Mistral, OpenAI, Gemini)
- `@cerebro/nestjs` - Optional NestJS module adapter

## Commands
- `pnpm build` - Build all packages (via Turbo)
- `pnpm test` - Run all tests (Vitest)
- `pnpm lint` - Lint all packages
- `pnpm format` - Format with Prettier

## Conventions
- TypeScript strict mode, ES2022 target
- tsup for building (ESM + CJS dual output)
- Vitest for testing
- All bus operations are async
- Errors use CerebroError hierarchy with ErrorCategory
- Context propagation via ExecutionContext (traceId, spanId, sessionId, tenantId)
