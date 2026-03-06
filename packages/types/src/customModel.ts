export interface CustomModelConfig {
  id: string;
  displayName: string;
  provider: string;
  baseUrl: string;
  modelId: string;
  apiKeyRef: string | null;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  status: 'connected' | 'error' | 'unchecked';
  lastVerified: string | null;
  errorMessage?: string;
}
