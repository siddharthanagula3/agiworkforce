
import type { Artifact } from '../../types/chat';
import type { ChatExecutionMode } from '@agiworkforce/types';

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
  taskId?: string;
  edited?: boolean;
  editedAt?: Date;
  originalContent?: string;
  widgets?: ChatWidgetData[];

  tool?: string;
  toolCall?: string;
  name?: string;
  event?: string;
  status?: string;
  state?: string;
  stage?: string;
  command?: string;
  requiresApproval?: boolean;
  actionId?: string;
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
  image?: {
    prompt: string;
    status: 'loading' | 'success' | 'error';
    urls?: string[];
    provider?: string;
    model?: string;
    latencyMs?: number;
    error?: string;
  };
  data?: Record<string, unknown>;
}

export interface InlinePanel {
  id: string;
  type:
    | 'terminal'
    | 'browser'
    | 'code'
    | 'database'
    | 'image'
    | 'swarm'
    | 'artifact'
    | 'skill'
    | 'vision'
    | 'memory'
    | 'voice'
    | 'agent'
    | 'git'
    | 'schedule'
    | 'lsp'
    | 'marketplace'
    | 'generic'
    | 'plan';
  content: InlinePanelContent;
  isCollapsed: boolean;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export type BuiltInSlashCommandName =
  | 'browser'
  | 'terminal'
  | 'code'
  | 'database'
  | 'undo'
  | 'compact'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'imagine'
  | 'swarm'
  | 'vision'
  | 'skills'
  | 'memory'
  | 'recall'
  | 'agents'
  | 'git'
  | 'schedule'
  | 'voice'
  | 'think'
  | 'docs'
  | 'record'
  | 'metrics'
  | 'marketplace'
  | 'desktop'
  | 'ocr'
  | 'notify'
  | 'lsp'
  | 'enhance'
  | 'migrate'
  | 'message'
  | 'settings'
  | 'plan';

export type SlashCommandName = BuiltInSlashCommandName | (string & {});

export type SlashCommandSource = 'builtin' | 'project-command';

export interface SlashCommandMetadata {
  command: SlashCommandName;
  args: string;
  rawInput: string;
  source?: SlashCommandSource;
  commandPath?: string;
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
  branchId?: string;
  parentMessageId?: string;
}

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
  createdAt?: Date;
  updatedAt: Date;
  customInstructions?: string;
  projectId?: string;
  incognito?: boolean;
  modelOverride?: string;
  executionMode: ChatExecutionMode;
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

export type ActiveView =
  | 'chat'
  | 'projects'
  | 'artifacts'
  | 'help'
  | 'tasks'
  | 'calendar'
  | 'documents'
  | 'database'
  | 'marketplace'
  | 'workflows'
  | 'skills'
  | 'images'
  | 'schedules'
  | 'deep-research'
  | 'artifacts-gallery'
  | 'analytics'
  | 'roi'
  | 'teams'
  | 'cloud'
  | 'mobile'
  | 'computer-use'
  | 'automation'
  | 'governance'
  | 'git'
  | 'terminal'
  | 'vision';

export type ConversationMode = 'auto' | 'manual';

export const DEFAULT_BRANCH_ID = 'main' as const;
