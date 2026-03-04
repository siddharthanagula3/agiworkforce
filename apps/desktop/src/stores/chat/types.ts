/**
 * Chat Store Types
 *
 * Shared type definitions for chat-related stores.
 * Extracted from unifiedChatStore for better modularity.
 */

import type { Artifact } from '../../types/chat';

/**
 * Widget data type for embedded widgets (INT-001)
 * Widgets can be forms, data tables, charts, confirmations, etc.
 */
export interface ChatWidgetData {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface MessageMetadata {
  tokenCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  provider?: string;
  cost?: number;
  inputCost?: number;
  outputCost?: number;
  duration?: number;
  streaming?: boolean;
  artifacts?: Artifact[];
  type?: 'reasoning' | 'response' | 'deep-research-task';
  /** Task ID for deep research messages */
  taskId?: string;
  /** Indicates this message was edited by the user */
  edited?: boolean;
  /** Timestamp of when the message was last edited */
  editedAt?: Date;
  /** Original content before editing (for history) */
  originalContent?: string;
  /** Embedded widgets in this message (INT-001) */
  widgets?: ChatWidgetData[];

  tool?: string;
  tool_call?: string;
  name?: string;
  event?: string;
  status?: string;
  state?: string;
  stage?: string;
  command?: string;
  requiresApproval?: boolean;
  actionId?: string;
  action_id?: string;
  sidecarType?: 'browser' | 'terminal' | 'code' | 'video' | 'media' | 'files' | 'data';
  thinking?: {
    title?: string;
    details?: string;
  };
  phase?: string;
  label?: string;
  summary?: string;
  preview?: string;
  toolRationale?: {
    toolName?: string;
    rationale?: string;
    alternatives?: string[];
    capabilities?: string[];
  };
}

export interface Attachment {
  id: string;
  type: 'file' | 'image' | 'screenshot' | 'audio';
  name: string;
  path?: string;
  size?: number;
  mimeType?: string;
  content?: string;
  /** Duration in seconds for audio files */
  duration?: number;
  /** Transcription text for audio files */
  transcription?: string;
}

export interface Operation {
  id: string;
  type: 'file' | 'terminal' | 'tool' | 'approval';
  timestamp: Date;
  data: unknown;
}

export type MessageReaction =
  | 'thumbsUp'
  | 'thumbsDown'
  | 'heart'
  | 'laugh'
  | 'thinking'
  | 'celebrate';

export interface InlinePanelContent {
  terminal?: {
    command: string;
    cwd?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    duration?: number;
    status: 'running' | 'success' | 'error';
  };
  browser?: {
    url: string;
    title?: string;
    screenshot?: string;
    status: 'loading' | 'success' | 'error';
    actions?: Array<{ type: string; timestamp: Date }>;
  };
  code?: {
    filePath: string;
    language?: string;
    content: string;
    diff?: string;
    isModified?: boolean;
  };
  database?: {
    query: string;
    results?: {
      columns: string[];
      rows: unknown[][];
      rowCount: number;
    };
    executionTime?: number;
    error?: string;
  };
  image?: {
    prompt: string;
    status: 'loading' | 'success' | 'error';
    urls?: string[];
    provider?: string;
    model?: string;
    latencyMs?: number;
    error?: string;
  };
}

export interface InlinePanel {
  id: string;
  type: 'terminal' | 'browser' | 'code' | 'database' | 'image';
  content: InlinePanelContent;
  isCollapsed: boolean;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SlashCommandMetadata {
  command:
    | 'browser'
    | 'terminal'
    | 'code'
    | 'database'
    | 'undo'
    | 'compact'
    | 'pdf'
    | 'word'
    | 'excel'
    | 'imagine';
  args: string;
  rawInput: string;
}

export interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
  attachments?: Attachment[];
  artifacts?: Artifact[];
  operations?: Operation[];
  streaming?: boolean;
  pending?: boolean;
  error?: string;
  bookmarked?: boolean;
  reactions?: MessageReaction[];
  inlinePanels?: InlinePanel[];
  slashCommand?: SlashCommandMetadata;
  /** Branch this message belongs to (defaults to 'main') */
  branchId?: string;
  /** Parent message ID for branched conversations */
  parentMessageId?: string;
}

/** Represents a conversation branch (fork point) */
export interface BranchSummary {
  id: string;
  name: string;
  parentBranchId?: string;
  forkPointMessageId?: number;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  archived?: boolean;
  lastMessage?: string;
  updatedAt: Date;
  /** Per-conversation custom instructions */
  customInstructions?: string;
  /** Project ID this conversation belongs to */
  projectId?: string;
  /** When true, messages in this conversation are not persisted to disk */
  incognito?: boolean;
}

// Pending user message - for mid-task input while AI is processing
export interface PendingUserMessage {
  id: string;
  content: string;
  timestamp: string;
  conversation_id?: number;
}

export interface Citation {
  id: string;
  index: number;
  url: string;
  title?: string;
  snippet?: string;
  favicon?: string;
  timestamp: Date;
}

export interface TokenUsage {
  current: number;
  inputTokens: number;
  outputTokens: number;
  max: number;
  percentage: number;
  estimatedCost: number;
}

export type FocusMode = 'web' | 'code' | 'academic' | 'reasoning' | 'deep-research' | null;

export type ActiveView = 'chat' | 'projects' | 'artifacts' | 'computer-use' | 'mobile-companion';

/**
 * Conversation Mode controls AI autonomy level
 * - 'auto': Agent acts autonomously without prompts (default)
 * - 'manual': Agent asks for permission before dangerous actions
 */
export type ConversationMode = 'auto' | 'manual';
