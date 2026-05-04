/**
 * OpenAI Responses API wire types — the subset we use.
 *
 * Source of truth: https://platform.openai.com/docs/api-reference/responses
 *
 * Hand-typed instead of importing the SDK's Responses module so we stay
 * decoupled from minor SDK shape churn (the official `openai` types churn
 * every minor version). The SDK is still used for the actual HTTP/SSE
 * transport via `client.responses.create({ stream: true })`.
 */

// ============================================================================
// Input items
// ============================================================================

export interface ResponsesInputTextContent {
  type: 'input_text';
  text: string;
}

export interface ResponsesInputImageContent {
  type: 'input_image';
  /** Either an image URL or a data: URL with base64 content. */
  image_url: string;
  /** "auto" | "low" | "high" — controls cost vs detail. */
  detail?: 'auto' | 'low' | 'high';
}

export type ResponsesInputContent = ResponsesInputTextContent | ResponsesInputImageContent;

export interface ResponsesInputMessage {
  type?: 'message';
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string | ResponsesInputContent[];
}

export interface ResponsesFunctionCallItem {
  type: 'function_call';
  call_id: string;
  name: string;
  /** JSON-encoded arguments string (per OpenAI spec). */
  arguments: string;
}

export interface ResponsesFunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  /** Tool result text (or JSON-stringified payload). */
  output: string;
}

export type ResponsesInputItem =
  | ResponsesInputMessage
  | ResponsesFunctionCallItem
  | ResponsesFunctionCallOutputItem;

// ============================================================================
// Tools
// ============================================================================

export interface ResponsesFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export type ResponsesToolChoice = 'auto' | 'none' | 'required' | { type: 'function'; name: string };

// ============================================================================
// Reasoning
// ============================================================================

export interface ResponsesReasoningConfig {
  /** "minimal" | "low" | "medium" | "high" */
  effort?: 'minimal' | 'low' | 'medium' | 'high';
  /** Include reasoning summary text in stream events. */
  summary?: 'auto' | 'concise' | 'detailed';
}

// ============================================================================
// Request
// ============================================================================

export interface ResponsesCreateParams {
  model: string;
  /** Either a single text input or an array of input items. */
  input: string | ResponsesInputItem[];
  /** System / developer prompt. Single string or block. */
  instructions?: string;
  tools?: ResponsesFunctionTool[];
  tool_choice?: ResponsesToolChoice;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  reasoning?: ResponsesReasoningConfig;
  /** Server-side conversation persistence + chaining. */
  store?: boolean;
  previous_response_id?: string;
  /** Routing hint. */
  service_tier?: 'auto' | 'default' | 'flex';
  /** Required for the streaming path we use. */
  stream: true;
  /** Streaming-specific options. */
  stream_options?: { include_obfuscation?: boolean };
  metadata?: Record<string, string>;
}

// ============================================================================
// Stream events (subset)
// ============================================================================

interface BaseEvent {
  /** Sequence number — useful for ordering across reconnects. */
  sequence_number?: number;
}

export interface ResponseCreatedEvent extends BaseEvent {
  type: 'response.created';
  response: { id: string; status: string; model: string };
}

export interface ResponseInProgressEvent extends BaseEvent {
  type: 'response.in_progress';
  response: { id: string };
}

export interface ResponseOutputItemAddedEvent extends BaseEvent {
  type: 'response.output_item.added';
  output_index: number;
  item:
    | { type: 'message'; id: string; role: string; status?: string }
    | { type: 'function_call'; id: string; call_id: string; name: string; arguments: string }
    | { type: 'reasoning'; id: string; summary?: Array<{ type: string; text: string }> };
}

export interface ResponseOutputItemDoneEvent extends BaseEvent {
  type: 'response.output_item.done';
  output_index: number;
  item:
    | { type: 'message'; id: string; role: string; status?: string }
    | {
        type: 'function_call';
        id: string;
        call_id: string;
        name: string;
        arguments: string;
        status?: string;
      }
    | { type: 'reasoning'; id: string; summary?: Array<{ type: string; text: string }> };
}

export interface ResponseTextDeltaEvent extends BaseEvent {
  type: 'response.output_text.delta';
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseTextDoneEvent extends BaseEvent {
  type: 'response.output_text.done';
  item_id: string;
  output_index: number;
  content_index: number;
  text: string;
}

export interface ResponseFunctionCallArgumentsDeltaEvent extends BaseEvent {
  type: 'response.function_call_arguments.delta';
  item_id: string;
  output_index: number;
  delta: string;
}

export interface ResponseFunctionCallArgumentsDoneEvent extends BaseEvent {
  type: 'response.function_call_arguments.done';
  item_id: string;
  output_index: number;
  arguments: string;
}

export interface ResponseReasoningSummaryTextDeltaEvent extends BaseEvent {
  type: 'response.reasoning_summary_text.delta';
  item_id: string;
  output_index: number;
  summary_index: number;
  delta: string;
}

export interface ResponseReasoningTextDeltaEvent extends BaseEvent {
  type: 'response.reasoning_text.delta';
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseRefusalDeltaEvent extends BaseEvent {
  type: 'response.refusal.delta';
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseCompletedEvent extends BaseEvent {
  type: 'response.completed';
  response: {
    id: string;
    status: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
      output_tokens_details?: { reasoning_tokens?: number };
    };
    incomplete_details?: { reason?: string };
  };
}

export interface ResponseFailedEvent extends BaseEvent {
  type: 'response.failed';
  response: { id: string; error?: { code?: string; message?: string } };
}

export interface ResponseIncompleteEvent extends BaseEvent {
  type: 'response.incomplete';
  response: { id: string; incomplete_details?: { reason?: string } };
}

export interface ResponseErrorEvent extends BaseEvent {
  type: 'response.error';
  code?: string;
  message?: string;
}

/** The minimal subset of stream event variants we care about. */
export type ResponsesStreamEvent =
  | ResponseCreatedEvent
  | ResponseInProgressEvent
  | ResponseOutputItemAddedEvent
  | ResponseOutputItemDoneEvent
  | ResponseTextDeltaEvent
  | ResponseTextDoneEvent
  | ResponseFunctionCallArgumentsDeltaEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | ResponseReasoningSummaryTextDeltaEvent
  | ResponseReasoningTextDeltaEvent
  | ResponseRefusalDeltaEvent
  | ResponseCompletedEvent
  | ResponseFailedEvent
  | ResponseIncompleteEvent
  | ResponseErrorEvent
  | { type: string; [k: string]: unknown };
