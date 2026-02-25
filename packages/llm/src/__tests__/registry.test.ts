import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import type { ILLMProvider } from '../provider.interface.js';
import type { LLMMessage, LLMOptions, LLMResponse, LLMChunk } from '../types.js';

class MockProvider implements ILLMProvider {
  readonly name: string;
  readonly supportsTools = true;

  constructor(name: string) {
    this.name = name;
  }

  async chat(_messages: LLMMessage[], _options?: LLMOptions): Promise<LLMResponse> {
    return {
      content: `Response from ${this.name}`,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: this.name,
      finishReason: 'stop',
    };
  }

  async *stream(_messages: LLMMessage[], _options?: LLMOptions): AsyncIterable<LLMChunk> {
    yield { content: `Stream from ${this.name}` };
    yield { finishReason: 'stop' };
  }
}

describe('ProviderRegistry', () => {
  it('should register and retrieve providers', () => {
    const registry = new ProviderRegistry();
    const claude = new MockProvider('claude');
    registry.register('claude', claude);

    expect(registry.get('claude')).toBe(claude);
    expect(registry.getOrThrow('claude')).toBe(claude);
  });

  it('should set first registered as default', () => {
    const registry = new ProviderRegistry();
    registry.register('claude', new MockProvider('claude'));
    registry.register('openai', new MockProvider('openai'));

    expect(registry.defaultProvider).toBe('claude');
    expect(registry.getDefault().name).toBe('claude');
  });

  it('should allow changing default', () => {
    const registry = new ProviderRegistry();
    registry.register('claude', new MockProvider('claude'));
    registry.register('openai', new MockProvider('openai'));
    registry.setDefault('openai');

    expect(registry.getDefault().name).toBe('openai');
  });

  it('should throw for unregistered provider', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.getOrThrow('nonexistent')).toThrow('not registered');
  });

  it('should throw when setting default to unregistered', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.setDefault('nonexistent')).toThrow('not registered');
  });

  it('should throw getDefault when empty', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.getDefault()).toThrow('No LLM providers registered');
  });

  it('should list registered providers', () => {
    const registry = new ProviderRegistry();
    registry.register('claude', new MockProvider('claude'));
    registry.register('openai', new MockProvider('openai'));

    expect(registry.list()).toEqual(['claude', 'openai']);
  });

  it('should unregister providers', () => {
    const registry = new ProviderRegistry();
    registry.register('claude', new MockProvider('claude'));
    registry.register('openai', new MockProvider('openai'));

    registry.unregister('claude');
    expect(registry.get('claude')).toBeUndefined();
    expect(registry.list()).toEqual(['openai']);
  });

  it('should use providers for chat', async () => {
    const registry = new ProviderRegistry();
    registry.register('mock', new MockProvider('test-model'));

    const provider = registry.getDefault();
    const response = await provider.chat([{ role: 'user', content: 'Hello' }]);

    expect(response.content).toBe('Response from test-model');
    expect(response.finishReason).toBe('stop');
  });

  it('should use providers for streaming', async () => {
    const registry = new ProviderRegistry();
    registry.register('mock', new MockProvider('test-model'));

    const provider = registry.getDefault();
    const chunks: LLMChunk[] = [];

    for await (const chunk of provider.stream([{ role: 'user', content: 'Hello' }])) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.content).toBe('Stream from test-model');
  });
});
