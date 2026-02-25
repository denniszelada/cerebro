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

export interface ClaudeProviderConfig extends LLMProviderConfig {
  useBedrock?: boolean;
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
}

export class ClaudeProvider implements ILLMProvider {
  readonly name = 'claude';
  readonly supportsTools = true;
  private readonly config: ClaudeProviderConfig;

  constructor(config: ClaudeProviderConfig = {}) {
    this.config = {
      defaultModel: 'claude-sonnet-4-20250514',
      ...config,
    };
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const client = await this.getClient();
    const model = options?.model ?? this.config.defaultModel ?? 'claude-sonnet-4-20250514';

    const { system, anthropicMessages } = this.convertMessages(messages);

    const params: Record<string, unknown> = {
      model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: anthropicMessages,
    };

    if (system) params['system'] = system;
    if (options?.temperature !== undefined) params['temperature'] = options.temperature;
    if (options?.topP !== undefined) params['top_p'] = options.topP;
    if (options?.stop) params['stop_sequences'] = options.stop;

    if (options?.tools && options.tools.length > 0) {
      params['tools'] = options.tools.map((t) => this.convertTool(t));
      if (options.toolChoice) {
        params['tool_choice'] = this.convertToolChoice(options.toolChoice);
      }
    }

    const response = await client.messages.create(params);

    return this.convertResponse(response);
  }

  async *stream(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMChunk> {
    const client = await this.getClient();
    const model = options?.model ?? this.config.defaultModel ?? 'claude-sonnet-4-20250514';

    const { system, anthropicMessages } = this.convertMessages(messages);

    const params: Record<string, unknown> = {
      model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: anthropicMessages,
      stream: true,
    };

    if (system) params['system'] = system;
    if (options?.temperature !== undefined) params['temperature'] = options.temperature;

    if (options?.tools && options.tools.length > 0) {
      params['tools'] = options.tools.map((t) => this.convertTool(t));
    }

    const stream = await client.messages.stream(params);

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>;
        if (delta['type'] === 'text_delta') {
          yield { content: delta['text'] as string };
        } else if (delta['type'] === 'input_json_delta') {
          yield {
            toolCall: {
              arguments: delta['partial_json'] as string,
            },
          };
        }
      } else if (event.type === 'message_stop') {
        yield { finishReason: 'stop' };
      }
    }
  }

  private convertMessages(messages: LLMMessage[]): {
    system: string | undefined;
    anthropicMessages: Array<{ role: string; content: unknown }>;
  } {
    let system: string | undefined;
    const anthropicMessages: Array<{ role: string; content: unknown }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else if (msg.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: msg.content,
            },
          ],
        });
      } else {
        anthropicMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return { system, anthropicMessages };
  }

  private convertTool(tool: ToolDefinition): Record<string, unknown> {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    };
  }

  private convertToolChoice(
    choice: 'auto' | 'none' | 'required' | { name: string },
  ): Record<string, unknown> {
    if (typeof choice === 'object') {
      return { type: 'tool', name: choice.name };
    }
    switch (choice) {
      case 'auto':
        return { type: 'auto' };
      case 'none':
        return { type: 'none' };
      case 'required':
        return { type: 'any' };
    }
  }

  private convertResponse(response: Record<string, unknown>): LLMResponse {
    const content: unknown[] = (response['content'] ?? []) as unknown[];
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b['type'] === 'text') {
        textContent += b['text'] as string;
      } else if (b['type'] === 'tool_use') {
        toolCalls.push({
          id: b['id'] as string,
          name: b['name'] as string,
          arguments: JSON.stringify(b['input']),
        });
      }
    }

    const usage = response['usage'] as Record<string, number> | undefined;
    const stopReason = response['stop_reason'] as string;

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: usage?.['input_tokens'] ?? 0,
        completionTokens: usage?.['output_tokens'] ?? 0,
        totalTokens: (usage?.['input_tokens'] ?? 0) + (usage?.['output_tokens'] ?? 0),
      },
      model: response['model'] as string,
      finishReason: stopReason === 'tool_use' ? 'tool_calls' : 'stop',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const module = await import('@anthropic-ai/sdk') as any;
      const AnthropicClass = module.default ?? module.Anthropic ?? module;

      if (this.config.useBedrock) {
        const BedrockClass = module.AnthropicBedrock ?? module.default?.AnthropicBedrock;
        if (!BedrockClass) {
          throw new Error('AnthropicBedrock not available. Check @anthropic-ai/sdk version.');
        }
        const client = new BedrockClass({
          awsRegion: this.config.awsRegion,
          awsAccessKey: this.config.awsAccessKeyId,
          awsSecretKey: this.config.awsSecretAccessKey,
        });
        return client;
      }

      const client = new AnthropicClass({
        apiKey: this.config.apiKey,
        ...(this.config.baseUrl ? { baseURL: this.config.baseUrl } : {}),
      });
      return client;
    } catch (err) {
      if ((err as Error).message?.includes('AnthropicBedrock')) throw err;
      throw new Error(
        'Failed to import @anthropic-ai/sdk. Install it: pnpm add @anthropic-ai/sdk',
      );
    }
  }
}
