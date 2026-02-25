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

export interface OpenAIProviderConfig extends LLMProviderConfig {
  organization?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
}

export class OpenAIProvider implements ILLMProvider {
  readonly name = 'openai';
  readonly supportsTools = true;
  private readonly config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig = {}) {
    this.config = {
      defaultModel: 'gpt-4o',
      ...config,
    };
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const client = await this.getClient();
    const model = options?.model ?? this.config.defaultModel ?? 'gpt-4o';

    const params: Record<string, unknown> = {
      model,
      messages: messages.map((m) => this.convertMessage(m)),
    };

    if (options?.temperature !== undefined) params['temperature'] = options.temperature;
    if (options?.maxTokens !== undefined) params['max_tokens'] = options.maxTokens;
    if (options?.topP !== undefined) params['top_p'] = options.topP;
    if (options?.stop) params['stop'] = options.stop;

    if (options?.tools && options.tools.length > 0) {
      params['tools'] = options.tools.map((t) => this.convertTool(t));
      if (options.toolChoice) {
        params['tool_choice'] = this.convertToolChoice(options.toolChoice);
      }
    }

    if (options?.responseFormat === 'json') {
      params['response_format'] = { type: 'json_object' };
    }

    const response = await client.chat.completions.create(params);
    return this.convertResponse(response);
  }

  async *stream(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMChunk> {
    const client = await this.getClient();
    const model = options?.model ?? this.config.defaultModel ?? 'gpt-4o';

    const params: Record<string, unknown> = {
      model,
      messages: messages.map((m) => this.convertMessage(m)),
      stream: true,
    };

    if (options?.temperature !== undefined) params['temperature'] = options.temperature;
    if (options?.maxTokens !== undefined) params['max_tokens'] = options.maxTokens;

    if (options?.tools && options.tools.length > 0) {
      params['tools'] = options.tools.map((t) => this.convertTool(t));
    }

    const stream = await client.chat.completions.create(params);

    for await (const chunk of stream as unknown as AsyncIterable<Record<string, unknown>>) {
      const choices = (chunk['choices'] ?? []) as Array<Record<string, unknown>>;
      const choice = choices[0];
      if (!choice) continue;

      const delta = choice['delta'] as Record<string, unknown> | undefined;
      if (!delta) continue;

      if (delta['content']) {
        yield { content: delta['content'] as string };
      }

      const toolCalls = delta['tool_calls'] as Array<Record<string, unknown>> | undefined;
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

      const finishReason = choice['finish_reason'] as string | null;
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
      result['tool_call_id'] = msg.toolCallId;
    }

    if (msg.toolCalls) {
      result['tool_calls'] = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
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

    const toolCallsRaw = message['tool_calls'] as Array<Record<string, unknown>> | undefined;
    const toolCalls: ToolCall[] | undefined = toolCallsRaw?.map((tc) => {
      const fn = tc['function'] as Record<string, unknown>;
      return {
        id: tc['id'] as string,
        name: fn['name'] as string,
        arguments: fn['arguments'] as string,
      };
    });

    const finishReason = choice['finish_reason'] as string;

    return {
      content: (message['content'] as string) ?? '',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: usage['prompt_tokens'] ?? 0,
        completionTokens: usage['completion_tokens'] ?? 0,
        totalTokens: usage['total_tokens'] ?? 0,
      },
      model: response['model'] as string,
      finishReason:
        finishReason === 'tool_calls'
          ? 'tool_calls'
          : finishReason === 'length'
            ? 'length'
            : finishReason === 'content_filter'
              ? 'content_filter'
              : 'stop',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const module = await import('openai') as any;
      const OpenAIClass = module.default ?? module.OpenAI ?? module;
      const clientConfig: Record<string, unknown> = {};

      if (this.config.apiKey) clientConfig['apiKey'] = this.config.apiKey;
      if (this.config.baseUrl) clientConfig['baseURL'] = this.config.baseUrl;
      if (this.config.organization) clientConfig['organization'] = this.config.organization;

      const client = new OpenAIClass(clientConfig);
      return client;
    } catch {
      throw new Error('Failed to import openai. Install it: pnpm add openai');
    }
  }
}
