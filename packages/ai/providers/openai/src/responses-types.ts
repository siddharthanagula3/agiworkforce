export interface ResponsesInputTextContent {
  type: 'input_text';
  text: string;
}

export interface ResponsesInputImageContent {
  type: 'input_image';
  image_url: string;
  detail?: 'auto' | 'low' | 'high';
}

export interface ResponsesInputFileContent {
  type: 'input_file';
  filename: string;
  file_data: string;
}

export type ResponsesInputContent =
  | ResponsesInputTextContent
  | ResponsesInputImageContent
  | ResponsesInputFileContent;

export interface ResponsesInputMessage {
  type?: 'message';
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string | ResponsesInputContent[];
}

export interface ResponsesFunctionCallItem {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

export interface ResponsesFunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export type ResponsesInputItem =
  | ResponsesInputMessage
  | ResponsesFunctionCallItem
  | ResponsesFunctionCallOutputItem;

export interface ResponsesFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface ResponsesNativeTool {
  type: string;
  [key: string]: unknown;
}

export type ResponsesTool = ResponsesFunctionTool | ResponsesNativeTool;

export type ResponsesHostedToolChoice = { type: string };

export type ResponsesToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; name: string }
  | ResponsesHostedToolChoice;

export interface ResponsesReasoningConfig {
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  summary?: 'auto' | 'concise' | 'detailed';
}

export interface ResponsesCreateParams {
  model: string;
  input: string | ResponsesInputItem[];
  instructions?: string;
  tools?: ResponsesTool[];
  tool_choice?: ResponsesToolChoice;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  reasoning?: ResponsesReasoningConfig;
  store?: boolean;
  previous_response_id?: string;
  service_tier?: 'auto' | 'default' | 'flex';
  stream: true;
  stream_options?: { include_obfuscation?: boolean };
  metadata?: Record<string, string>;
  include?: Array<'web_search_call.action.sources'>;
  prompt_cache_key?: string;
}

interface BaseEvent {
  sequence_number?: number;
}

export interface ResponseWebSearchSource {
  type: 'url';
  url: string;
}

export type ResponseWebSearchAction =
  | {
      type: 'search';
      query: string;
      queries?: string[];
      sources?: ResponseWebSearchSource[];
    }
  | { type: 'open_page'; url: string }
  | { type: 'find'; url: string; pattern: string };

export interface ResponseWebSearchCallItem {
  type: 'web_search_call';
  id: string;
  status?: 'in_progress' | 'searching' | 'completed' | 'failed';
  action?: ResponseWebSearchAction;
}

export interface ResponseOutputTextContent {
  type: 'output_text';
  text: string;
  annotations?: unknown[];
}

export interface ResponseOutputRefusalContent {
  type: 'refusal';
  refusal: string;
}

export interface ResponseOutputMessageItem {
  type: 'message';
  id: string;
  role: string;
  status?: string;
  content?: Array<ResponseOutputTextContent | ResponseOutputRefusalContent>;
}

export interface ResponseOutputFunctionCallItem {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: string;
}

export interface ResponseOutputReasoningItem {
  type: 'reasoning';
  id: string;
  summary?: Array<{ type: string; text: string }>;
}

export type ResponseOutputItem =
  | ResponseOutputMessageItem
  | ResponseOutputFunctionCallItem
  | ResponseOutputReasoningItem
  | ResponseWebSearchCallItem
  | { type: string; [key: string]: unknown };

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
  item: ResponseOutputItem;
}

export interface ResponseOutputItemDoneEvent extends BaseEvent {
  type: 'response.output_item.done';
  output_index: number;
  item: ResponseOutputItem;
}

export interface ResponseOutputTextAnnotationAddedEvent extends BaseEvent {
  type: 'response.output_text.annotation.added';
  item_id: string;
  output_index: number;
  content_index: number;
  annotation_index: number;
  annotation:
    | {
        type: 'url_citation';
        url: string;
        title: string;
        start_index: number;
        end_index: number;
      }
    | { type: string; [key: string]: unknown };
}

export interface ResponseWebSearchCallLifecycleEvent extends BaseEvent {
  type:
    | 'response.web_search_call.in_progress'
    | 'response.web_search_call.searching'
    | 'response.web_search_call.completed';
  item_id: string;
  output_index: number;
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
    output?: ResponseOutputItem[];
    output_text?: string;
    error?: { code?: string; message?: string } | null;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
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
  type: 'error';
  code?: string;
  message?: string;
  param?: string;
}

export interface ResponseLegacyErrorEvent extends BaseEvent {
  type: 'response.error';
  code?: string;
  message?: string;
}

export type ResponsesStreamEvent =
  | ResponseCreatedEvent
  | ResponseInProgressEvent
  | ResponseOutputItemAddedEvent
  | ResponseOutputItemDoneEvent
  | ResponseTextDeltaEvent
  | ResponseTextDoneEvent
  | ResponseOutputTextAnnotationAddedEvent
  | ResponseWebSearchCallLifecycleEvent
  | ResponseFunctionCallArgumentsDeltaEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | ResponseReasoningSummaryTextDeltaEvent
  | ResponseReasoningTextDeltaEvent
  | ResponseRefusalDeltaEvent
  | ResponseCompletedEvent
  | ResponseFailedEvent
  | ResponseIncompleteEvent
  | ResponseErrorEvent
  | ResponseLegacyErrorEvent
  | { type: string; [k: string]: unknown };
