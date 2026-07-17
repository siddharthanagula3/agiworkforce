import type { IntentType } from './intentClassifier';

/**
 * Legacy optional metadata accepted by the Desktop IPC request contract.
 *
 * The shipping chat path does not derive routing decisions in the renderer.
 * Model selection is owned by the shared registry-backed routing package and
 * the privileged runtime independently validates the requested provider/model.
 * This DTO remains only for backward-compatible deserialization while older
 * persisted requests are phased out.
 */
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
