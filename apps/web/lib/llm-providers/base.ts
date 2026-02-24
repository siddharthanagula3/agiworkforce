import 'server-only';

/** HTTP status codes that indicate a temporary server error and should be retried */
export const RETRYABLE_HTTP_STATUS_CODES = new Set([500, 502, 503, 504]);

export interface LLMProviderResponse {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason?: string;
  cacheCreationInputTokens?: number;
  cachedInputTokens?: number;
  tool_calls?: unknown[]; // Tool calls if the model used function calling
}

export interface LLMProviderRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
    multimodal_content?: unknown[];
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  thinking_mode?: boolean;
  usePromptCache?: boolean;
  thinking?: {
    type: string;
    budget_tokens?: number;
  };
  effort?: string;
}

export abstract class BaseLLMProvider {
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || this.getDefaultBaseUrl();
  }

  abstract getDefaultBaseUrl(): string;
  abstract sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse>;
  abstract streamRequest(request: LLMProviderRequest): Promise<ReadableStream>;

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }
}
