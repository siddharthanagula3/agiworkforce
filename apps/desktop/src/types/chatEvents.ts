/**
 * Type definitions for chat-related Tauri events
 * These types define the payload structure for events emitted from the Rust backend
 */

// ============================================================================
// Processing Step Events
// ============================================================================

export type ProcessingStepType =
  | 'prompt_enhancement'
  | 'routing'
  | 'tool_call'
  | 'reasoning'
  | 'generation';

export type ProcessingStepStatus = 'pending' | 'in_progress' | 'completed' | 'error';

export interface ProcessingStep {
  id: string;
  type: ProcessingStepType;
  status: ProcessingStepStatus;
  title: string;
  description?: string;
  progress?: number; // 0-100
  metadata?: Record<string, unknown>;
  startTime?: number; // Unix timestamp in milliseconds
  endTime?: number; // Unix timestamp in milliseconds
}

export interface ProcessingStepPayload {
  conversationId: number;
  messageId: number;
  step: ProcessingStep;
}

// ============================================================================
// Tool Execution Events
// ============================================================================

export type ToolExecutionStatus = 'running' | 'completed' | 'error';

export interface ToolExecution {
  id: string;
  name: string;
  status: ToolExecutionStatus;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  duration?: number; // Duration in milliseconds
  startTime?: number;
  endTime?: number;
}

export interface ToolExecutionStartPayload {
  conversationId: number;
  messageId: number;
  execution: ToolExecution;
}

export interface ToolExecutionUpdatePayload {
  conversationId: number;
  messageId: number;
  executionId: string;
  status: ToolExecutionStatus;
  output?: string;
  error?: string;
  duration?: number;
}

export interface ToolExecutionEndPayload {
  conversationId: number;
  messageId: number;
  executionId: string;
  output?: string;
  error?: string;
  duration: number;
}

// ============================================================================
// AI Reasoning Events
// ============================================================================

export interface ReasoningPayload {
  conversationId: number;
  messageId: number;
  reasoning: string;
  metadata?: {
    provider?: string;
    model?: string;
    temperature?: number;
    tokens?: number;
  };
}

// ============================================================================
// Progress Events
// ============================================================================

export interface ProgressPayload {
  conversationId: number;
  messageId: number;
  progress: number; // 0-100
  stage: string; // Description of current stage
  estimatedTimeRemaining?: number; // Seconds
}

// ============================================================================
// Error Events
// ============================================================================

export interface ErrorPayload {
  conversationId: number;
  messageId: number;
  error: string;
  errorType: 'network' | 'api' | 'validation' | 'timeout' | 'unknown';
  recoverable: boolean;
  retryable: boolean;
  suggestedAction?: string;
}

// ============================================================================
// Provider Routing Events
// ============================================================================

export interface ProviderRoutingPayload {
  conversationId: number;
  messageId: number;
  selectedProvider: string;
  selectedModel: string;
  reason: string;
  alternatives?: Array<{
    provider: string;
    model: string;
    score: number;
  }>;
  estimatedCost?: number;
  estimatedTokens?: number;
}

// ============================================================================
// Prompt Enhancement Events
// ============================================================================

export interface PromptEnhancementPayload {
  conversationId: number;
  messageId: number;
  originalPrompt: string;
  enhancedPrompt: string;
  enhancements: Array<{
    type: 'clarity' | 'context' | 'specificity' | 'formatting' | 'safety';
    description: string;
  }>;
  tokensAdded: number;
}

// ============================================================================
// Event Type Map (for type-safe event listeners)
// ============================================================================

export interface ChatEventMap {
  'chat:processing-step': ProcessingStepPayload;
  'chat:tool-execution-start': ToolExecutionStartPayload;
  'chat:tool-execution-update': ToolExecutionUpdatePayload;
  'chat:tool-execution-end': ToolExecutionEndPayload;
  'chat:reasoning': ReasoningPayload;
  'chat:progress': ProgressPayload;
  'chat:error': ErrorPayload;
  'chat:provider-routing': ProviderRoutingPayload;
  'chat:prompt-enhancement': PromptEnhancementPayload;
}

// ============================================================================
// Helper Types
// ============================================================================

export type ChatEventType = keyof ChatEventMap;

export type ChatEventPayload<T extends ChatEventType> = ChatEventMap[T];

// ============================================================================
// Type-safe event listener helper
// ============================================================================

/**
 * Example usage:
 *
 * ```typescript
 * import { listen } from '@tauri-apps/api/event';
 * import type { ChatEventPayload } from '@/types/chatEvents';
 *
 * // Type-safe event listener
 * const unlisten = await listen<ChatEventPayload<'chat:processing-step'>>(
 *   'chat:processing-step',
 *   (event) => {
 *     // event.payload is fully typed
 *     console.log(event.payload.step.title);
 *   }
 * );
 * ```
 */

// ============================================================================
// Rust Backend Event Emission Examples
// ============================================================================

/**
 * To emit these events from the Rust backend, use:
 *
 * ```rust
 * use serde::Serialize;
 * use tauri::Manager;
 *
 * #[derive(Serialize)]
 * struct ProcessingStep {
 *     id: String,
 *     #[serde(rename = "type")]
 *     step_type: String,
 *     status: String,
 *     title: String,
 *     description: Option<String>,
 *     progress: Option<u8>,
 *     metadata: Option<serde_json::Value>,
 *     #[serde(rename = "startTime")]
 *     start_time: Option<i64>,
 *     #[serde(rename = "endTime")]
 *     end_time: Option<i64>,
 * }
 *
 * #[derive(Serialize)]
 * struct ProcessingStepPayload {
 *     #[serde(rename = "conversationId")]
 *     conversation_id: i64,
 *     #[serde(rename = "messageId")]
 *     message_id: i64,
 *     step: ProcessingStep,
 * }
 *
 * // Emit event
 * app.emit_all("chat:processing-step", ProcessingStepPayload {
 *     conversation_id: 1,
 *     message_id: 42,
 *     step: ProcessingStep {
 *         id: uuid::Uuid::new_v4().to_string(),
 *         step_type: "prompt_enhancement".to_string(),
 *         status: "in_progress".to_string(),
 *         title: "Enhancing prompt".to_string(),
 *         description: Some("Analyzing user intent".to_string()),
 *         progress: Some(50),
 *         metadata: None,
 *         start_time: Some(chrono::Utc::now().timestamp_millis()),
 *         end_time: None,
 *     }
 * })?;
 * ```
 */
