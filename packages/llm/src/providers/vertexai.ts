import type { ILLMProvider } from '../provider.interface.js';
import type {
  LLMChunk,
  LLMMessage,
  LLMOptions,
  LLMResponse,
  ToolCall,
  ToolDefinition,
} from '../types.js';

export interface VertexAIProviderConfig {
  project: string;
  location?: string;
  defaultModel?: string;
  defaultOptions?: Partial<LLMOptions>;
}

export class VertexAIProvider implements ILLMProvider {
  readonly name = 'vertexai';
  readonly supportsTools = true;
  private readonly config: VertexAIProviderConfig;

  constructor(config: VertexAIProviderConfig) {
    this.config = {
      location: 'us-central1',
      defaultModel: 'gemini-2.5-flash',
      ...config,
    };
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const ai = await this.getClient();
    const modelName = options?.model ?? this.config.defaultModel ?? 'gemini-2.5-flash';
    const { contents, systemInstruction } = this.convertMessages(messages);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options?.maxTokens !== undefined
        ? { maxOutputTokens: options.maxTokens }
        : {}),
      ...(options?.topP !== undefined ? { topP: options.topP } : {}),
      ...(options?.stop ? { stopSequences: options.stop } : {}),
    };

    if (options?.tools && options.tools.length > 0) {
      config.tools = [{ functionDeclarations: options.tools.map((t) => this.convertTool(t)) }];
    }

    if (options?.responseFormat === 'json') {
      config.responseMimeType = 'application/json';
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config,
    });

    return this.convertResponse(response, modelName);
  }

  async *stream(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMChunk> {
    const ai = await this.getClient();
    const modelName = options?.model ?? this.config.defaultModel ?? 'gemini-2.5-flash';
    const { contents, systemInstruction } = this.convertMessages(messages);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options?.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
    };

    if (options?.tools && options.tools.length > 0) {
      config.tools = [{ functionDeclarations: options.tools.map((t) => this.convertTool(t)) }];
    }

    const response = await ai.models.generateContentStream({
      model: modelName,
      contents,
      config,
    });

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        yield { content: text };
      }

      const candidates = chunk.candidates ?? [];
      for (const candidate of candidates) {
        if (candidate.finishReason) {
          yield { finishReason: candidate.finishReason === 'STOP' ? 'stop' : 'stop' };
        }
      }
    }
  }

  private convertMessages(messages: LLMMessage[]): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contents: any;
    systemInstruction?: string;
  } {
    let systemInstruction: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
      } else if (msg.role === 'tool') {
        contents.push({
          role: 'function',
          parts: [{ text: msg.content }],
        });
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { contents, systemInstruction };
  }

  private convertTool(tool: ToolDefinition): Record<string, unknown> {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertResponse(response: any, model: string): LLMResponse {
    const text = response.text ?? '';
    const toolCalls: ToolCall[] = [];

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      for (const fc of functionCalls) {
        toolCalls.push({
          id: `fc_${Math.random().toString(36).slice(2)}`,
          name: fc.name,
          arguments: JSON.stringify(fc.args ?? {}),
        });
      }
    }

    const usageMeta = response.usageMetadata ?? {};

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: usageMeta.promptTokenCount ?? 0,
        completionTokens: usageMeta.candidatesTokenCount ?? 0,
        totalTokens: usageMeta.totalTokenCount ?? 0,
      },
      model,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    try {
      const module = await import('@google/genai');
      const GoogleGenAI = module.GoogleGenAI;

      if (!this.config.project) {
        throw new Error('VertexAI requires a Google Cloud project ID');
      }

      const client = new GoogleGenAI({
        vertexai: true,
        project: this.config.project,
        location: this.config.location ?? 'us-central1',
      });

      return client;
    } catch (err) {
      if ((err as Error).message?.includes('project')) throw err;
      throw new Error(
        'Failed to import @google/genai. Install it: pnpm add @google/genai',
      );
    }
  }
}
