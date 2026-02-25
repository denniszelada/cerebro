# @cerebro/nestjs

NestJS module adapter for the Cerebro framework. Provides `CerebroModule` with `forRoot()`/`forRootAsync()`, class decorators for experts and brains, and an injectable `CerebroService` wrapper.

## Install

```bash
pnpm add @cerebro/nestjs @cerebro/core @cerebro/bus @cerebro/llm @cerebro/knowledge
```

## Key Exports

| Export | Purpose |
|---|---|
| `CerebroModule` | Global NestJS module (`forRoot` / `forRootAsync`) |
| `CerebroService` | Injectable service -- `process()`, `getBrain()`, `getBus()` |
| `@CerebroExpert()` | Class decorator to register an expert |
| `@CerebroBrain()` | Class decorator to mark a brain |
| `CEREBRO_BUS`, `CEREBRO_BRAIN`, ... | Injection tokens for direct access |

## Usage

### Module setup

```ts
import { Module } from '@nestjs/common';
import { CerebroModule } from '@cerebro/nestjs';
import { ClaudeProvider } from '@cerebro/llm';

@Module({
  imports: [
    CerebroModule.forRoot({
      bus: { mode: 'local' },
      brain: { name: 'my-brain' },
      llmProviders: [
        {
          name: 'claude',
          provider: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY! }),
          default: true,
        },
      ],
      knowledgePaths: ['./knowledge'],
    }),
  ],
})
export class AppModule {}
```

### Defining an expert

```ts
import { Injectable } from '@nestjs/common';
import { CerebroExpert } from '@cerebro/nestjs';
import { Expert } from '@cerebro/core';

@Injectable()
@CerebroExpert({
  name: 'search',
  domain: 'retrieval',
  capabilities: ['web-search', 'lookup'],
})
export class SearchExpert extends Expert {
  name = 'search';
  domain = 'retrieval';
  capabilities = ['web-search', 'lookup'];

  async process(task, context) {
    // implementation
    return { type: 'text', data: '...', expertName: this.name };
  }
}
```

### Using CerebroService

```ts
import { Controller, Post, Body } from '@nestjs/common';
import { CerebroService } from '@cerebro/nestjs';

@Controller('chat')
export class ChatController {
  constructor(private readonly cerebro: CerebroService) {}

  @Post()
  async chat(@Body() body: { message: string }) {
    return this.cerebro.process({
      type: 'text',
      payload: body.message,
      source: 'http',
    });
  }
}
```

### Async configuration

```ts
CerebroModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    bus: { mode: config.get('BUS_MODE') },
    brain: { name: 'my-brain' },
  }),
});
```

## More Info

See the [main Cerebro README](../../README.md) for full documentation.
