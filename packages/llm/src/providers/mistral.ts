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

export class MistralProvider implements ILLMProvider {
  readonly name = 'mistral';
  readonly supportsTools = true;
  private readonly config: LLMProviderConfig;

  constructor(config: LLMProviderConfig = {}) {
    this.config = {
      defaultModel: 'mistral-large-latest',
      ...config,
    };
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const client = await this.getClient();
    const model = options?.model ?? this.config.defaultModel ?? 'mistral-large-latest';

    const params: Record<string, unknown> = {
      model,
      messages: messages.map((m) => this.convertMessage(m)),
    };

    if (options?.temperature !== undefined) params['temperature'] = options.temperature;
    if (options?.maxTokens !== undefined) params['maxTokens'] = options.maxTokens;
    if (options?.topP !== undefined) params['topP'] = options.topP;

    if (options?.tools && options.tools.length > 0) {
      params['tools'] = options.tools.map((t) => this.convertTool(t));
      if (options.toolChoice) {
        params['toolChoice'] = this.convertToolChoice(options.toolChoice);
      }
    }

    if (options?.responseFormat === 'json') {
      params['responseFormat'] = { type: 'json_object' };
    }

    const response = await client.chat.complete(params);
    return this.convertResponse(response);
  }

  async *stream(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMChunk> {
    const client = await this.getClient();
    const model = options?.model ?? this.config.defaultModel ?? 'mistral-large-latest';

    const params: Record<string, unknown> = {
      model,
      messages: messages.map((m) => this.convertMessage(m)),
    };

    if (options?.temperature !== undefined) params['temperature'] = options.temperature;
    if (options?.maxTokens !== undefined) params['maxTokens'] = options.maxTokens;

    if (options?.tools && options.tools.length > 0) {
      params['tools'] = options.tools.map((t) => this.convertTool(t));
    }

    const stream = await client.chat.stream(params);

    for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
      const data = event['data'] as Record<string, unknown> | undefined;
      if (!data) continue;
      const choices = (data['choices'] ?? []) as Array<Record<string, unknown>>;
      const choice = choices[0];
      if (!choice) continue;

      const delta = choice['delta'] as Record<string, unknown> | undefined;
      if (delta?.['content']) {
        yield { content: delta['content'] as string };
      }

      const toolCalls = delta?.['toolCalls'] as Array<Record<string, unknown>> | undefined;
      if (toolCalls && toolCalls.length > 0) {
        const tc = toolCalls[0]!;
        const fn = tc['function'] as Record<string, unknown> | undefined;
        yield {
          toolCall: {
            id: tc['id'] as string | undefined,
            name: fn?.['name'] as string | undefined,
            arguments: fn?.['arguments'] as string | undefined,
          },
        };
      }

      const finishReason = choice['finishReason'] as string | null;
      if (finishReason) {
        yield {
          finishReason:
            finishReason === 'tool_calls'
              ? 'tool_calls'
              : finishReason === 'length'
                ? 'length'
                : 'stop',
        };
      }
    }
  }

  private convertMessage(msg: LLMMessage): Record<string, unknown> {
    const result: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.role === 'tool' && msg.toolCallId) {
      result['toolCallId'] = msg.toolCallId;
    }

    return result;
  }

  private convertTool(tool: ToolDefinition): Record<string, unknown> {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  private convertToolChoice(
    choice: 'auto' | 'none' | 'required' | { name: string },
  ): unknown {
    if (typeof choice === 'object') {
      return { type: 'function', function: { name: choice.name } };
    }
    return choice;
  }

  private convertResponse(response: Record<string, unknown>): LLMResponse {
    const choices = (response['choices'] ?? []) as Array<Record<string, unknown>>;
    const choice = choices[0] ?? {};
    const message = (choice['message'] ?? {}) as Record<string, unknown>;
    const usage = (response['usage'] ?? {}) as Record<string, number>;

    const toolCallsRaw = message['toolCalls'] as Array<Record<string, unknown>> | undefined;
    const toolCalls: ToolCall[] | undefined = toolCallsRaw?.map((tc) => {
      const fn = tc['function'] as Record<string, unknown>;
      return {
        id: tc['id'] as string,
        name: fn['name'] as string,
        arguments: typeof fn['arguments'] === 'string' ? fn['arguments'] : JSON.stringify(fn['arguments']),
      };
    });

    const finishReason = choice['finishReason'] as string;

    return {
      content: (message['content'] as string) ?? '',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: usage['promptTokens'] ?? 0,
        completionTokens: usage['completionTokens'] ?? 0,
        totalTokens: (usage['promptTokens'] ?? 0) + (usage['completionTokens'] ?? 0),
      },
      model: response['model'] as string,
      finishReason:
        finishReason === 'tool_calls' ? 'tool_calls' : finishReason === 'length' ? 'length' : 'stop',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const module = await import('@mistralai/mistralai') as any;
      const Mistral = module.Mistral ?? module.default;
      return new Mistral({
        apiKey: this.config.apiKey,
        ...(this.config.baseUrl ? { serverURL: this.config.baseUrl } : {}),
      });
    } catch {
      throw new Error(
        'Failed to import @mistralai/mistralai. Install it: pnpm add @mistralai/mistralai',
      );
    }
  }
}
