export type Provider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'mistral'
  | 'meta'
  | 'xai'
  | 'deepseek'
  | 'local';

export type ModelTier = 'flagship' | 'standard' | 'fast' | 'local';

export interface ModelInfo {
  id: string;
  name: string;
  provider: Provider;
  tier: ModelTier;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  contextWindow: number;
  isLocal: boolean;
  isByok: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  projectId?: string;
  model?: string;
  messageCount: number;
  lastMessage?: string;
  tags?: string[];
  archived: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  model?: string;
  provider?: Provider;
  attachments?: Attachment[];
  thinkingBlocks?: ThinkingBlock[];
  toolCalls?: ToolCall[];
  citations?: Citation[];
  artifacts?: Artifact[];
  imageUrl?: string;
  videoUrl?: string;
  isStreaming?: boolean;
}

export interface Attachment {
  id: string;
  type: 'image' | 'document' | 'code' | 'audio';
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface ThinkingBlock {
  id: string;
  summary: string;
  steps: ThinkingStep[];
  collapsed: boolean;
  durationMs?: number;
}

export interface ThinkingStep {
  id: string;
  type: 'thinking' | 'reading' | 'script' | 'creating' | 'search' | 'tool' | 'done';
  content: string;
  badge?: string;
  badgeType?: 'result' | 'script' | 'file';
  result?: string;
  resultCollapsed?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: Record<string, unknown>;
  output?: string;
  durationMs?: number;
  requiresApproval?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface Citation {
  id: string;
  url: string;
  title: string;
  domain: string;
  faviconUrl?: string;
  additionalCount?: number;
}

export interface Artifact {
  id: string;
  type: 'html' | 'react' | 'code' | 'document' | 'research' | 'image' | 'svg' | 'mermaid';
  title: string;
  content: string;
  language?: string;
  mimeType?: string;
}

export interface WebSearchResult {
  query: string;
  resultCount: number;
  results: Array<{
    title: string;
    url: string;
    domain: string;
    faviconUrl?: string;
  }>;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  starred: boolean;
  conversationIds: string[];
  memory?: string;
  instructions?: string;
  files?: ProjectFile[];
}

export interface ProjectFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  source?: 'upload' | 'github';
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  addedBy: 'user' | 'system';
  updatedAt: string;
  invokedBy: 'user' | 'ai' | 'both';
  allowedTools: string[];
  content: string;
  files?: string[];
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon?: string;
  connected: boolean;
  category: ConnectorCategory;
  popularity?: number;
  tools?: ConnectorTool[];
}

export type ConnectorCategory =
  | 'code'
  | 'communication'
  | 'data'
  | 'design'
  | 'development'
  | 'financial'
  | 'health'
  | 'productivity'
  | 'sales';

export interface ConnectorTool {
  id: string;
  name: string;
  type: 'read' | 'write' | 'other';
  permission: 'auto' | 'ask' | 'blocked';
}

export interface StreamChunk {
  type:
    | 'text'
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'citation'
    | 'artifact'
    | 'image'
    | 'video'
    | 'search'
    | 'done'
    | 'error';
  content?: string;
  data?: Record<string, unknown>;
}

export interface SendMessageParams {
  conversationId: string;
  content: string;
  model: string;
  provider: Provider;
  attachments?: Attachment[];
  enableThinking?: boolean;
  enableWebSearch?: boolean;
  projectInstructions?: string;
  signal?: AbortSignal;
}
