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
  progress?: number;
  metadata?: Record<string, unknown>;
  startTime?: number;
  endTime?: number;
}

export interface ProcessingStepPayload {
  conversationId: number;
  messageId: number;
  step: ProcessingStep;
}

export type ToolExecutionStatus = 'running' | 'completed' | 'error';

export interface ToolExecution {
  id: string;
  name: string;
  status: ToolExecutionStatus;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  duration?: number;
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

export interface ProgressPayload {
  conversationId: number;
  messageId: number;
  progress: number;
  stage: string;
  estimatedTimeRemaining?: number;
}

export interface ErrorPayload {
  conversationId: number;
  messageId: number;
  error: string;
  errorType: 'network' | 'api' | 'validation' | 'timeout' | 'unknown';
  recoverable: boolean;
  retryable: boolean;
  suggestedAction?: string;
}

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

export type ChatEventType = keyof ChatEventMap;

export type ChatEventPayload<T extends ChatEventType> = ChatEventMap[T];
