// Chat Services - Public API

export { chatPersistenceService } from './conversation-storage';
export { conversationBranchingService } from './conversation-branching';
export type {
  ConversationBranch,
  ConversationBranchWithDetails,
  ConversationTree,
  BranchHistoryEntry,
} from './conversation-branching';
export { folderManagementService } from './folder-management-service';
export { messageBookmarksService } from './message-bookmarks-service';
export { globalSearchService } from './global-search-service';
export { messageReactionsService } from './message-reactions-service';
export {
  getUserShortcuts,
  createUserShortcut,
  updateUserShortcut,
  deleteUserShortcut,
} from './user-shortcuts';
export { documentExportService } from './document-export-service';
export { documentGenerationService } from './document-generation-service';
export { attachmentHandler } from './attachment-handler';
export { ChatAIService } from './chat-ai-service';
export type { SkillInfo } from './chat-ai-service';
