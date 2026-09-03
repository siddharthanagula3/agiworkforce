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
  reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  metadata?: Record<string, string>;
  store?: boolean;
  prompt_cache_key?: string;
  service_tier?: 'auto' | 'default' | 'flex';
}

export interface OpenAIChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  service_tier?: string;
  system_fingerprint?: string;
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
    logprobs?: unknown;
    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      cache_write_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  } | null;
}
