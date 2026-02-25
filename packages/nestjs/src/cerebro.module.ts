import { type DynamicModule, Module } from '@nestjs/common';
import { createBus } from '@cerebro/bus';
import { Brain, Gateway } from '@cerebro/core';
import { ProviderRegistry } from '@cerebro/llm';
import { HybridStore, loadYamlKnowledge } from '@cerebro/knowledge';
import {
  CEREBRO_BUS,
  CEREBRO_BRAIN,
  CEREBRO_GATEWAY,
  CEREBRO_KNOWLEDGE,
  CEREBRO_LLM_REGISTRY,
  CEREBRO_MODULE_OPTIONS,
} from './constants.js';
import { CerebroService } from './cerebro.service.js';
import type { CerebroModuleAsyncOptions, CerebroModuleOptions } from './interfaces.js';

@Module({})
export class CerebroModule {
  static forRoot(options: CerebroModuleOptions = {}): DynamicModule {
    return {
      module: CerebroModule,
      global: true,
      providers: [
        {
          provide: CEREBRO_MODULE_OPTIONS,
          useValue: options,
        },
        ...CerebroModule.createProviders(),
        CerebroService,
      ],
      exports: [CerebroService, CEREBRO_BUS, CEREBRO_BRAIN, CEREBRO_GATEWAY, CEREBRO_LLM_REGISTRY],
    };
  }

  static forRootAsync(options: CerebroModuleAsyncOptions): DynamicModule {
    return {
      module: CerebroModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: CEREBRO_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        ...CerebroModule.createProviders(),
        CerebroService,
      ],
      exports: [CerebroService, CEREBRO_BUS, CEREBRO_BRAIN, CEREBRO_GATEWAY, CEREBRO_LLM_REGISTRY],
    };
  }

  private static createProviders() {
    return [
      {
        provide: CEREBRO_BUS,
        useFactory: (options: CerebroModuleOptions) => {
          return createBus(options.bus ?? { mode: 'local' });
        },
        inject: [CEREBRO_MODULE_OPTIONS],
      },
      {
        provide: CEREBRO_LLM_REGISTRY,
        useFactory: (options: CerebroModuleOptions) => {
          const registry = new ProviderRegistry();
          if (options.llmProviders) {
            for (const p of options.llmProviders) {
              registry.register(p.name, p.provider);
              if (p.default) {
                registry.setDefault(p.name);
              }
            }
          }
          return registry;
        },
        inject: [CEREBRO_MODULE_OPTIONS],
      },
      {
        provide: CEREBRO_KNOWLEDGE,
        useFactory: (options: CerebroModuleOptions) => {
          const domains = [];
          if (options.knowledgePaths) {
            for (const path of options.knowledgePaths) {
              domains.push(...loadYamlKnowledge(path));
            }
          }
          return new HybridStore({ domains });
        },
        inject: [CEREBRO_MODULE_OPTIONS],
      },
      {
        provide: CEREBRO_BRAIN,
        useFactory: (
          options: CerebroModuleOptions,
          bus: ReturnType<typeof createBus>,
          llmRegistry: ProviderRegistry,
          knowledge: HybridStore,
        ) => {
          return new Brain(options.brain ?? {}, {
            bus,
            llmRegistry,
            knowledge,
          });
        },
        inject: [CEREBRO_MODULE_OPTIONS, CEREBRO_BUS, CEREBRO_LLM_REGISTRY, CEREBRO_KNOWLEDGE],
      },
      {
        provide: CEREBRO_GATEWAY,
        useFactory: (brain: Brain) => {
          return new Gateway(brain);
        },
        inject: [CEREBRO_BRAIN],
      },
    ];
  }
}
