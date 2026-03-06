import type { BusFactoryOptions } from '@denniszelada/cerebro-bus';
import type { BrainConfig } from '@denniszelada/cerebro-core';
import type { ILLMProvider } from '@denniszelada/cerebro-llm';
import type { InjectionToken, ModuleMetadata, OptionalFactoryDependency } from '@nestjs/common';

export interface CerebroModuleOptions {
  bus?: BusFactoryOptions;
  brain?: BrainConfig;
  llmProviders?: Array<{ name: string; provider: ILLMProvider; default?: boolean }>;
  knowledgePaths?: string[];
}

export interface CerebroModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => Promise<CerebroModuleOptions> | CerebroModuleOptions;
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
}
