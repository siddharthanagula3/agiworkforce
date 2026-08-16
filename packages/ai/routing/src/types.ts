/**
 * Internal types for the @agiworkforce/routing package.
 *
 * The public taxonomy `RoutingTaskType` lives in
 * `@agiworkforce/types/runtime.ts` and is re-exported below for convenience.
 *
 * @module routing/types
 * @packageDocumentation
 */

import type { RoutingTaskType } from '@agiworkforce/types';

export type { RoutingTaskType } from '@agiworkforce/types';

export interface RoutingMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';

  content: string;

  taskType?: RoutingTaskType;

  taskTypeConfidence?: number;
}

export interface RoutingAttachment {
  mime: string;

  type?: 'screenshot' | 'image' | 'video' | 'document' | 'audio' | string;
}

export interface ClassifierResult {
  type: RoutingTaskType;

  confidence: number;
}

export interface ConversationContext {
  cumulativeTokens: number;

  recentTaskTypes: ReadonlyArray<RoutingTaskType>;
}
