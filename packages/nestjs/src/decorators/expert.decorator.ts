import { CEREBRO_EXPERT_METADATA } from '../constants.js';

export interface CerebroExpertOptions {
  name: string;
  domain: string;
  capabilities: string[];
  description?: string;
  llmProvider?: string;
}

export function CerebroExpert(options: CerebroExpertOptions): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(CEREBRO_EXPERT_METADATA, options, target);
  };
}
