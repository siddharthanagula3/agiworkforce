import 'server-only';

export interface LLMProviderResponse {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason?: string;
  cacheCreationInputTokens?: number;
  cachedInputTokens?: number;
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

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }
}
