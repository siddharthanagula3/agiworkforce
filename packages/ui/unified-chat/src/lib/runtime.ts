import type {
  Attachment,
  Artifact,
  ChatMessage,
  Conversation,
  GeneratedFileEntry,
  ToolCall,
  WebSearchResult,
} from './types';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

export interface CloudMessageProjection {
  finishReason?: string;
  streamError?: { message: string; code?: string; retryable?: boolean };
  thinking?: string;
  toolCalls?: ToolCall[];
  webSearchResults?: WebSearchResult[];
  generatedFiles?: GeneratedFileEntry[];
  artifacts?: Artifact[];
  codeExecutionResult?: {
    stdout: string;
    stderr: string;
    returnCode: number;
    images?: Array<{ mediaType: string; data: string }>;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
  };
  research?: {
    phase: 'planning' | 'searching' | 'synthesizing' | 'complete' | 'error';
    label?: string;
    iteration?: number;
    maxIterations?: number;
    searches?: number;
    sources?: number;
    elapsedMs?: number;
    error?: string;
  };
}

export interface CloudApprovalTurnProjection {
  assistantMessageId: string;
  runId: string;
  runReference?: {
    runId: string;
    runPath: string;
    lastSequence: number;
    state?: AgentTaskState;
    cancellationRequestedAt?: string | null;
  };
  model: string;
  assistantContent: string;
  calls: Array<{
    toolCallId: string;
    name: string;
    args: Record<string, unknown>;
    decision?: 'approved' | 'rejected';
  }>;
  agentActivity?: AgentActivityState;
  messageProjection?: CloudMessageProjection;
}
export interface CloudRunReattachment {
  assistantMessageId: string;
  model: string;
  content: string;
  runReference: {
    runId: string;
    runPath: string;
    lastSequence: number;
  };
  hasPersistedApproval?: boolean;
}

import type { CloudWorkMode } from '@agiworkforce/types';
import type { MediaKind } from '../stores/mediaModeStore';

export interface ChatRuntime {
  sendMessage(conversationId: string, content: string, options?: SendMessageOptions): Promise<void>;

  stopGeneration(conversationId: string): void;

  getMessages?(conversationId: string): Promise<ChatMessage[]>;

  deleteMessages?(conversationId: string, messageIds: string[]): Promise<void>;

  loadMessages?(conversationId: string): Promise<ChatMessage[]>;

  createConversation(title?: string): Promise<string | Conversation>;

  deleteConversation(conversationId: string): Promise<void>;

  listConversations?(): Promise<{ id: string; title: string; updatedAt: string }[]>;

  loadConversations?(): Promise<Conversation[]>;

  renameConversation(conversationId: string, title: string): Promise<void>;

  archiveConversation?(conversationId: string, userId?: string, archived?: boolean): Promise<void>;

  updateConversationTitle?(conversationId: string, title: string): Promise<void>;

  onStream?(callback: StreamCallback): () => void;

  dispose?(): void | Promise<void>;

  uploadFile?(file: File): Promise<FileRef>;

  attachmentPolicy?: ChatAttachmentPolicy;

  getPlatform?(): 'desktop' | 'web' | 'mobile';

  supportsContinueGeneration?: boolean;

  supportsCodeExecution?: boolean;

  supportsResearch?: boolean;

  supportsImageGeneration?: boolean;

  supportsVideoGeneration?: boolean;

  supportsComputerUse?: boolean;

  supportsConcurrentTurns?: boolean;

  supportsManagedWebSearch?: boolean;

  supportsExplicitLocalWebSearch?: boolean;

  supportsAgentControl?: boolean;

  supportsReasoningEffort?: boolean;

  resolveToolApproval?(
    conversationId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
  ): Promise<void>;

  hasLiveApprovalTurn?(conversationId: string, projection?: CloudApprovalTurnProjection): boolean;

  reattachConversation?(
    conversationId: string,
    persisted: CloudRunReattachment,
  ): Promise<void> | void;

  updateArtifact?(artifactId: string, content: string): Promise<{ id: string; content: string }>;

  getArtifactVersions?(current: Artifact): Promise<Artifact[]>;
}

export interface ChatAttachmentPolicy {
  accept: string;
  maxFiles: number;
  maxTotalBytes: number;
  validate(file: File): string | null;
}

export interface SendMessageOptions {
  model?: string;
  provider?: string;
  attachments?: File[];
  userMessageId?: string;
  assistantMessageId?: string;
  thinkingEnabled?: boolean;
  webSearch?: boolean;
  localToolScope?: LocalToolScope;
  research?: boolean;
  workMode?: CloudWorkMode;
  skillName?: string;
  projectId?: string | null;
  codeExecution?: boolean;
  signal?: AbortSignal;
  systemPrompt?: string;
  messageHistory?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: Attachment[];
  }>;
  isContinuation?: boolean;
  continuationMessageId?: string;
  agentMode?: string;
  effort?: string;
  mediaMode?: MediaKind;
}

export interface SendMessageParams {
  conversationId: string;
  content: string;
  model?: string;
  provider?: string;
  attachments?: TauriAttachmentPayload[];
  signal?: AbortSignal;
  thinkingEnabled?: boolean;
  webSearch?: boolean;
  localToolScope?: LocalToolScope;
  workMode?: CloudWorkMode;
  systemPrompt?: string;
  agentMode?: string;
  effort?: string;
  enableTools?: boolean;
}

export type LocalToolScope = 'web_search' | 'agi_work';

export type StreamChunk =
  | { type: 'text'; content: string }
  | {
      type: 'thinking';
      content: string;
      durationMs?: number;
      completed?: boolean;
    }
  | { type: 'agent_event'; data: AgentEventEnvelope }
  | { type: 'tool_call'; data: ToolCallData }
  | { type: 'tool_result'; data: ToolResultData }
  | { type: 'artifact'; data: Artifact }
  | { type: 'done' }
  | { type: 'error'; content: string };

export interface ToolCallData {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  input?: Record<string, unknown>;
}

export interface ToolResultData {
  id: string;
  name: string;
  status: 'completed' | 'failed';
  output?: string;
  error?: string;
  durationMs?: number;
}

export interface FileRef {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface TauriAttachmentPayload {
  id: string;
  type: 'image' | 'file' | 'document' | 'code' | 'url';
  name: string;
  mimeType?: string;
  content?: string;
  path?: string;
}

type StreamEventPayload =
  | { type: 'content'; content: string }
  | {
      type: 'thinking';
      content: string;
      durationMs?: number;
      completed?: boolean;
    }
  | { type: 'agent_run'; runId: string; runPath: string }
  | {
      type: 'agent_event';
      envelope: AgentEventEnvelope;
    }
  | { type: 'tool_call'; toolCall: { id: string; name: string; args: Record<string, unknown> } }
  | {
      type: 'tool_result';
      toolCallId: string;
      result?: string;
      error?: string;
      durationMs?: number;
    }
  | {
      type: 'tool_approval_request';
      toolCallId: string;
      name: string;
      args: Record<string, unknown>;
    }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'search_results'; search: WebSearchResult }
  | { type: 'generated_files'; files: GeneratedFileEntry[] }
  | {
      type: 'code_execution_result';
      result: {
        stdout: string;
        stderr: string;
        returnCode: number;
        images?: Array<{ mediaType: string; data: string }>;
      };
    }
  | {
      type: 'research_status';
      status: {
        phase: 'planning' | 'searching' | 'synthesizing' | 'complete' | 'error';
        label?: string;
        iteration?: number;
        maxIterations?: number;
        searches?: number;
        sources?: number;
        elapsedMs?: number;
        error?: string;
      };
    }
  | {
      type: 'done';
      finishReason?: string;
      streamError?: { message: string; code?: string; retryable?: boolean };
      usage?: CloudMessageProjection['usage'];
    }
  | {
      type: 'error';
      error: string;
      code?: string;
      resetAt?: string;
    };

export type StreamEvent = StreamEventPayload & { conversationId?: string };

export type StreamCallback = (event: StreamEvent) => void;
