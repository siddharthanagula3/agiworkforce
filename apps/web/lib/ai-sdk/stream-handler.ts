import 'server-only';

import {
  streamText,
  jsonSchema,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { StreamChunk } from '@agiworkforce/types';
import {
  adaptAiSdkChunkToStreamChunk,
  adaptAiSdkFinishToStreamChunks,
  type AiSdkChunkLike,
} from './event-adapter';

export interface AiSdkTool {
  description?: string;
  parameters: ReturnType<typeof jsonSchema>;
  execute?: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface StreamHandlerOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  tools?: ToolSet;
  providerOptions?: ProviderOptions;
  onToolCall?: (params: {
    toolCallId: string;
    toolName: string;
    args: unknown;
  }) => Promise<unknown> | unknown;
  onToolResult?: (params: {
    toolCallId: string;
    toolName: string;
    args: unknown;
    result: unknown;
  }) => void;
  onReasoning?: (text: string) => void;
  onChunk?: (chunk: string) => void;
  onAgiEvent?: (chunk: StreamChunk) => void;
  onFinish?: (params: {
    text: string;
    reasoning?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
    };
    finishReason?: string;
  }) => void;
  abortSignal?: AbortSignal;
}

export async function createAiSdkStream(options: StreamHandlerOptions): Promise<Response> {
  const {
    model,
    messages,
    system,
    maxTokens,
    temperature,
    topP,
    tools,
    providerOptions,
    onToolCall,
    onToolResult,
    onReasoning,
    onChunk,
    onAgiEvent,
    onFinish,
    abortSignal,
  } = options;

  const result = streamText({
    model,
    messages,
    ...(system ? { system } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
    ...(tools ? { tools } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    abortSignal,

    onChunk: async ({ chunk }) => {
      const agiChunk = adaptAiSdkChunkToStreamChunk(chunk as unknown as AiSdkChunkLike);
      if (agiChunk && onAgiEvent) {
        onAgiEvent(agiChunk);
      }

      if (chunk.type === 'text-delta' && onChunk) {
        onChunk(chunk.text);
      }
      if (chunk.type === 'reasoning-delta' && onReasoning) {
        onReasoning(chunk.text);
      }
    },

    onFinish: async ({ text, usage, finishReason, reasoning }) => {
      if (onAgiEvent) {
        for (const chunk of adaptAiSdkFinishToStreamChunks({
          finishReason,
          ...(usage
            ? {
                usage: {
                  inputTokens: usage.inputTokens ?? 0,
                  outputTokens: usage.outputTokens ?? 0,
                },
              }
            : {}),
        })) {
          onAgiEvent(chunk);
        }
      }

      if (onFinish) {
        let reasoningText: string | undefined;
        if (reasoning) {
          if (Array.isArray(reasoning)) {
            reasoningText = (reasoning as Array<{ text?: string }>)
              .map((r) => r.text ?? '')
              .join('');
          } else if (typeof reasoning === 'string') {
            reasoningText = reasoning;
          }
        }

        onFinish({
          text,
          reasoning: reasoningText,
          usage: usage
            ? {
                promptTokens: usage.inputTokens ?? 0,
                completionTokens: usage.outputTokens ?? 0,
                totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
                cacheReadInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? undefined,
                cacheCreationInputTokens: usage.inputTokenDetails?.cacheWriteTokens ?? undefined,
              }
            : undefined,
          finishReason,
        });
      }
    },
  });

  if (onToolCall) {
    void (async () => {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'tool-call') {
            const agiChunk = adaptAiSdkChunkToStreamChunk(part as unknown as AiSdkChunkLike);
            if (agiChunk && onAgiEvent) {
              onAgiEvent(agiChunk);
            }

            try {
              const toolArgs =
                (part as unknown as { input?: unknown; args?: unknown }).input ??
                (part as unknown as { args?: unknown }).args ??
                {};

              const toolResult = await onToolCall({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: toolArgs,
              });

              if (onToolResult) {
                onToolResult({
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  args: toolArgs,
                  result: toolResult,
                });
              }
            } catch {
              // Individual tool errors surfaced through stream protocol
            }
          }
        }
      } catch {
        // Stream iteration errors are non-fatal for the response
      }
    })();
  }

  return result.toTextStreamResponse({
    headers: {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export function toCoreMessages(
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>,
): ModelMessage[] {
  const coreMessages: ModelMessage[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        coreMessages.push({ role: 'system', content: msg.content });
        break;

      case 'user':
        coreMessages.push({ role: 'user', content: msg.content });
        break;

      case 'assistant': {
        const toolCalls = msg.tool_calls as
          | Array<{ id: string; function: { name: string; arguments: string } }>
          | undefined;

        if (toolCalls && toolCalls.length > 0) {
          coreMessages.push({
            role: 'assistant',
            content: [
              ...(msg.content ? [{ type: 'text' as const, text: msg.content }] : []),
              ...toolCalls.map((tc) => ({
                type: 'tool-call' as const,
                toolCallId: tc.id,
                toolName: tc.function.name,
                input: (() => {
                  try {
                    return JSON.parse(tc.function.arguments) as Record<string, unknown>;
                  } catch {
                    return {} as Record<string, unknown>;
                  }
                })(),
              })),
            ],
          });
        } else {
          coreMessages.push({ role: 'assistant', content: msg.content });
        }
        break;
      }

      case 'tool':
        if (msg.tool_call_id) {
          coreMessages.push({
            role: 'tool',
            content: [
              {
                type: 'tool-result' as const,
                toolCallId: msg.tool_call_id,
                toolName: '',
                output: { type: 'text' as const, value: msg.content },
              },
            ],
          });
        }
        break;

      default:
        break;
    }
  }

  return coreMessages;
}

interface OpenAIToolDefinition {
  type?: string;
  function?: { name: string; description?: string; parameters?: Record<string, unknown> };
}

export function toAiSdkTools(tools?: OpenAIToolDefinition[]): ToolSet | undefined {
  if (!tools || tools.length === 0) return undefined;

  const sdkTools: ToolSet = {};

  for (const toolDef of tools) {
    if (toolDef.type === 'function' && toolDef.function) {
      const { name, description, parameters } = toolDef.function;
      sdkTools[name] = tool({
        description,
        inputSchema: jsonSchema(parameters ?? { type: 'object', properties: {} }),
      });
    }
  }

  return Object.keys(sdkTools).length > 0 ? sdkTools : undefined;
}
