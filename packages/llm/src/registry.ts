import type { ILLMProvider } from './provider.interface.js';

export class ProviderRegistry {
  private readonly providers = new Map<string, ILLMProvider>();
  private defaultName?: string;

  register(name: string, provider: ILLMProvider): void {
    this.providers.set(name, provider);
    if (!this.defaultName) {
      this.defaultName = name;
    }
  }

  unregister(name: string): void {
    this.providers.delete(name);
    if (this.defaultName === name) {
      this.defaultName = this.providers.keys().next().value;
    }
  }

  get(name: string): ILLMProvider | undefined {
    return this.providers.get(name);
  }

  getOrThrow(name: string): ILLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`LLM provider "${name}" not registered`);
    }
    return provider;
  }

  getDefault(): ILLMProvider {
    if (!this.defaultName) {
      throw new Error('No LLM providers registered');
    }
    return this.getOrThrow(this.defaultName);
  }

  setDefault(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Cannot set default: provider "${name}" not registered`);
    }
    this.defaultName = name;
  }

  get defaultProvider(): string | undefined {
    return this.defaultName;
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}
