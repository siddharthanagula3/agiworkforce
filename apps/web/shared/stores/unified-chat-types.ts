import type { Artifact } from '@shared/types/chat';

export interface ChatWidgetData {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface EnhancedMessageMetadata {
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
  taskId?: string;
  edited?: boolean;
  editedAt?: Date;
  originalContent?: string;
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
  duration?: number;
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
}

export interface InlinePanel {
  id: string;
  type: 'terminal' | 'browser' | 'code' | 'database';
  content: InlinePanelContent;
  isCollapsed: boolean;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SlashCommandMetadata {
  command: 'browser' | 'terminal' | 'code' | 'database' | 'undo' | 'compact';
  args: string;
  rawInput: string;
}

export interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: EnhancedMessageMetadata;
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
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  archived?: boolean;
  lastMessage?: string;
  updatedAt: Date;
  customInstructions?: string;
  projectId?: string;
}

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

export type ActiveView = 'chat' | 'projects' | 'artifacts';

export type ConversationMode = 'auto' | 'manual';
