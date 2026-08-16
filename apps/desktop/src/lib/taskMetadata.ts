import type { IntentType } from './intentClassifier';

export type TaskMetadata = {
  intents: string[];
  requiresVision: boolean;
  tokenEstimate: number;
  costPriority: 'low' | 'balanced';
  intentType?: IntentType;
  modelCategory?: 'chat' | 'image' | 'video' | 'search' | 'tts' | 'stt' | 'music';
  selectedModel?: string;
  suggestedToolCategories?: string[];
  autoExecuteTools?: boolean;
  confidence?: number;
  routingReason?: string;
};
