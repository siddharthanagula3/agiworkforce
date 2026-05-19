/**
 * features/trees/ — Sidebar tree providers.
 * ConversationTreeProvider: history tree (agi-workforce.conversations view).
 * ContextPanelProvider: context files tree (agi-workforce.contextPanel view).
 */
export { ConversationTreeItem, ConversationTreeProvider } from './conversationTreeProvider';
export {
  ContextItem,
  ContextPanelProvider,
  setContextPanelInstance,
  getContextPanelProvider,
} from './contextPanelProvider';
