import type { LLMChunk, LLMMessage, LLMOptions, LLMResponse } from './types.js';

export interface ILLMProvider {
  readonly name: string;
  readonly supportsTools: boolean;

  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  stream(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMChunk>;
}
