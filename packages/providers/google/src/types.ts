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
};

export interface GeminiThinkingConfig {
  includeThoughts?: boolean;
  thinkingBudget?: number;
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
