/**
 * OpenAI Chat Completions wire types — the subset we use.
 *
 * Hand-typed instead of importing the full `openai` SDK type tree, so we
 * stay decoupled from minor SDK shape churn. The SDK is still used for the
 * actual HTTP/SSE transport.
 */

export type OpenAIChatToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

export interface OpenAIChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface OpenAIChatUserMessagePartText {
  type: 'text';
  text: string;
}
export interface OpenAIChatUserMessagePartImage {
  type: 'image_url';
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
}
export type OpenAIChatUserMessagePart =
  | OpenAIChatUserMessagePartText
  | OpenAIChatUserMessagePartImage;

export interface OpenAIChatUserMessageParam {
  role: 'user';
  content: string | OpenAIChatUserMessagePart[];
  name?: string;
}

export interface OpenAIChatAssistantToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OpenAIChatAssistantMessageParam {
  role: 'assistant';
  content: string | null;
  tool_calls?: OpenAIChatAssistantToolCall[];
  name?: string;
}

export interface OpenAIChatSystemMessageParam {
  role: 'system' | 'developer';
  content: string;
  name?: string;
}

export interface OpenAIChatToolMessageParam {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

export type OpenAIChatMessageParam =
  | OpenAIChatSystemMessageParam
  | OpenAIChatUserMessageParam
  | OpenAIChatAssistantMessageParam
  | OpenAIChatToolMessageParam;

export interface OpenAIChatCompletionCreateParams {
  model: string;
  messages: OpenAIChatMessageParam[];
  stream: true;
  stream_options?: { include_usage: boolean };
  tools?: OpenAIChatTool[];
  tool_choice?: OpenAIChatToolChoice;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  metadata?: Record<string, string>;
  store?: boolean;
  prompt_cache_key?: string;
  service_tier?: 'auto' | 'default' | 'flex';
}

/** Single SSE chunk from `chat.completions.stream`. */
export interface OpenAIChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  } | null;
}
