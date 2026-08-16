
import type { AIEmployeeBasic, AIEmployeePerformance } from '@shared/types';

export type {
  MessageRole,
  ToolCallStatus,
  ChatMessage,
  SimpleChatMessage,
  ChatSession,
  ChatSettings,
  Tool,
  ToolCall,
  Attachment,
  StreamingUpdate,
  AIEmployeeBasic,
  AIEmployeeStatus,
  AIEmployeePerformance,
  MessageMetadata,
  MessageReaction,
} from '@shared/types';

export type ChatMode = 'team' | 'engineer' | 'research' | 'race' | 'solo';

export interface ChatAIEmployee extends AIEmployeeBasic {
  role: string;
  capabilities: string[];
  tools: string[];
  performance?: Pick<AIEmployeePerformance, 'tasksCompleted' | 'successRate' | 'avgResponseTime'>;
}

/**
 * @deprecated Use ChatAIEmployee instead
 */
export type AIEmployee = ChatAIEmployee;

export interface ChatMessageMetadata {
  mode?: ChatMode;
  model?: string;
  temperature?: number;
  tokens?: number;
  cost?: number;
  employeeId?: string;
  [key: string]: unknown;
}

export interface FeatureChatSession {
  id: string;
  title: string;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  tokenCount: number;
  cost: number;
  isPinned: boolean;
  isArchived: boolean;
  isStarred?: boolean;
  folder?: string;
  tags: string[];
  sharedLink?: string;
  participants: string[];
  metadata?: Record<string, unknown> & {
    starred?: boolean;
    pinned?: boolean;
    archived?: boolean;
    tags?: string[];
  };
}
