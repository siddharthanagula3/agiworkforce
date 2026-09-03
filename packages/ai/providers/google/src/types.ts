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
  includeServerSideToolInvocations?: boolean;
};

export interface GeminiThinkingConfig {
  includeThoughts?: boolean;
  thinkingBudget?: number;
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

export interface GeminiGroundingChunk {
  web?: { uri: string; title?: string };
}

export interface GeminiGroundingSupport {
  segment?: { startIndex?: number; endIndex?: number; text?: string };
  groundingChunkIndices?: number[];
}

export interface GeminiUrlContextMetadata {
  urlMetadata?: Array<{ retrievedUrl?: string; urlRetrievalStatus?: string }>;
}

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
    groundingMetadata?: {
      groundingChunks?: GeminiGroundingChunk[];
      groundingSupports?: GeminiGroundingSupport[];
    };
    urlContextMetadata?: GeminiUrlContextMetadata;
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
