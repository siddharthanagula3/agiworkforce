// Chat Feature - Public API

// Components
export * from './components';

// Hooks
export * from './hooks';

// Types — exclude ToolCall/ToolCallStatus since they are already exported by ./components
export type {
  ChatMode,
  ChatAIEmployee,
  AIEmployee,
  ChatMessageMetadata,
  FeatureChatSession,
  MessageRole,
  ChatMessage,
  SimpleChatMessage,
  ChatSession,
  ChatSettings,
  Tool,
  Attachment,
  StreamingUpdate,
  AIEmployeeBasic,
  AIEmployeeStatus,
  AIEmployeePerformance,
  MessageMetadata,
  MessageReaction,
} from './types';
