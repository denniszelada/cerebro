import type { ILLMProvider } from '../provider.interface.js';
import type {
  LLMChunk,
  LLMMessage,
  LLMOptions,
  LLMProviderConfig,
  LLMResponse,
  ToolCall,
  ToolDefinition,
} from '../types.js';

export class GeminiProvider implements ILLMProvider {
  readonly name = 'gemini';
  readonly supportsTools = true;
  private readonly config: LLMProviderConfig;

  constructor(config: LLMProviderConfig = {}) {
    this.config = {
      defaultModel: 'gemini-2.0-flash',
      ...config,
    };
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = await this.getModel(options?.model);
    const { history, lastMessage, systemInstruction } = this.convertMessages(messages);

    const chatSession = model.startChat({
      history,
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      ...(options?.tools && options.tools.length > 0
        ? { tools: [{ functionDeclarations: options.tools.map((t) => this.convertTool(t)) }] }
        : {}),
      generationConfig: {
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options?.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
        ...(options?.topP !== undefined ? { topP: options.topP } : {}),
        ...(options?.stop ? { stopSequences: options.stop } : {}),
      },
    });

    const result = await chatSession.sendMessage(lastMessage);
    const response = result.response;
    return this.convertResponse(response, options?.model ?? this.config.defaultModel ?? 'gemini-2.0-flash');
  }

  async *stream(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMChunk> {
    const model = await this.getModel(options?.model);
    const { history, lastMessage, systemInstruction } = this.convertMessages(messages);

    const chatSession = model.startChat({
      history,
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      ...(options?.tools && options.tools.length > 0
        ? { tools: [{ functionDeclarations: options.tools.map((t) => this.convertTool(t)) }] }
        : {}),
      generationConfig: {
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options?.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
      },
    });

    const result = await chatSession.sendMessageStream(lastMessage);

    for await (const chunk of result.stream) {
      const text = chunk.text?.();
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
    history: Array<{ role: string; parts: Array<{ text: string }> }>;
    lastMessage: string;
    systemInstruction?: string;
  } {
    let systemInstruction: string | undefined;
    const history: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
      } else if (msg.role === 'tool') {
        history.push({
          role: 'function',
          parts: [{ text: msg.content }],
        });
      } else {
        history.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    const last = history.pop();
    const lastMessage = last?.parts[0]?.text ?? '';

    return { history, lastMessage, systemInstruction };
  }

  private convertTool(tool: ToolDefinition): Record<string, unknown> {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };
  }

  private convertResponse(
    response: Record<string, unknown>,
    model: string,
  ): LLMResponse {
    const text = typeof (response as { text?: () => string }).text === 'function'
      ? (response as { text: () => string }).text()
      : '';

    const candidates = (response['candidates'] ?? []) as Array<Record<string, unknown>>;
    const candidate = candidates[0];
    const toolCalls: ToolCall[] = [];

    if (candidate) {
      const content = candidate['content'] as Record<string, unknown> | undefined;
      const parts = (content?.['parts'] ?? []) as Array<Record<string, unknown>>;
      for (const part of parts) {
        const functionCall = part['functionCall'] as Record<string, unknown> | undefined;
        if (functionCall) {
          toolCalls.push({
            id: `fc_${Math.random().toString(36).slice(2)}`,
            name: functionCall['name'] as string,
            arguments: JSON.stringify(functionCall['args']),
          });
        }
      }
    }

    const usageMeta = (response['usageMetadata'] ?? {}) as Record<string, number>;

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: usageMeta['promptTokenCount'] ?? 0,
        completionTokens: usageMeta['candidatesTokenCount'] ?? 0,
        totalTokens: usageMeta['totalTokenCount'] ?? 0,
      },
      model,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getModel(modelName?: string): Promise<any> {
    try {
      const module = await import('@google/generative-ai');
      const GoogleGenerativeAI = module.GoogleGenerativeAI;

      if (!this.config.apiKey) {
        throw new Error('Gemini requires an API key');
      }

      const genAI = new GoogleGenerativeAI(this.config.apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName ?? this.config.defaultModel ?? 'gemini-2.0-flash',
      });

      return model as ReturnType<typeof this.getModel> extends Promise<infer T> ? T : never;
    } catch (err) {
      if ((err as Error).message?.includes('API key')) throw err;
      throw new Error(
        'Failed to import @google/generative-ai. Install it: pnpm add @google/generative-ai',
      );
    }
  }
}
