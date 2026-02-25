import type { BusFactoryOptions } from '@cerebro/bus';
import type { BrainConfig } from '@cerebro/core';
import type { ILLMProvider } from '@cerebro/llm';
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
