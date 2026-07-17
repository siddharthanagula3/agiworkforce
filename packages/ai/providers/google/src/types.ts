/**
 * Google Generative Language API wire types — the subset we use.
 *
 * Source: https://ai.google.dev/api/rest/v1beta/models/streamGenerateContent
 *
 * Hand-typed instead of pulling in `@google/genai` so we stay decoupled
 * from minor SDK shape churn. We hit
 * `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`
 * directly with API key auth.
 */

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thought?: boolean;
  thoughtSignature?: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiSystemInstruction {
  parts: Array<{ text: string }>;
}

export interface GeminiTool {
  functionDeclarations?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export type GeminiToolConfig = {
  functionCallingConfig?: {
    mode: 'AUTO' | 'ANY' | 'NONE';
    allowedFunctionNames?: string[];
  };
  /**
   * Required by Gemini (3.x; every Gemini model in our catalog) when a request
   * combines built-in tools (e.g. google_search grounding) with
   * functionDeclarations — without it the API 400s with INVALID_ARGUMENT
   * ("Please enable tool_config.include_server_side_tool_invocations to use
   * Built-in tools with Function calling."). When set, Gemini executes
   * built-in tools server-side and may surface their invocations as extra
   * parts alongside functionCall parts; translateGeminiStream ignores part
   * shapes it does not know, so those pass through harmlessly while
   * groundingMetadata still carries the sources.
   */
  includeServerSideToolInvocations?: boolean;
};

export interface GeminiThinkingConfig {
  includeThoughts?: boolean;
  thinkingBudget?: number;
  /** Gemini 3.x discrete thinking level (current control; supersedes thinkingBudget). */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
}

export interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    thinkingConfig?: GeminiThinkingConfig;
    responseMimeType?: string;
  };
  safetySettings?: Array<{
    category: string;
    threshold: 'BLOCK_NONE' | 'BLOCK_LOW_AND_ABOVE' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_ONLY_HIGH';
  }>;
}

/** A single SSE chunk emitted by `:streamGenerateContent`. */
export interface GeminiStreamChunk {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?:
      | 'STOP'
      | 'MAX_TOKENS'
      | 'SAFETY'
      | 'RECITATION'
      | 'LANGUAGE'
      | 'OTHER'
      | 'BLOCKLIST'
      | 'PROHIBITED_CONTENT'
      | 'SPII'
      | 'MALFORMED_FUNCTION_CALL'
      | 'IMAGE_SAFETY'
      | string;
    index?: number;
    safetyRatings?: Array<{ category: string; probability: string; blocked?: boolean }>;
    /**
     * Google Search grounding sources attached to this candidate. Present
     * only when the request used the native `google_search` tool and the
     * model actually grounded its answer. `web.uri`/`web.title` are the
     * fields the legacy apps/web/lib/llm-providers/google.ts reshaped into
     * the web v1 route's `x_search_results` delta (source cards) — see
     * `translateGeminiStream`'s `server-tool-result` producer in stream.ts.
     */
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri: string; title?: string };
      }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{ category: string; probability: string; blocked?: boolean }>;
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  modelVersion?: string;
}
