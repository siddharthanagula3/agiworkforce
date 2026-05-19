/**
 * features/chat-participant/ — @agi chat participant registered in VS Code Chat panel.
 * Handles /explain /fix /refactor /tests /docs /model slash commands.
 * Streams from AGI Workforce API with fallback to vscode.lm.
 */
export {
  createChatHandler,
  registerChatParticipant,
  buildSystemPrompt,
  buildUserMessage,
  gatherEditorContext,
  historyToMessages,
} from './chatParticipant';
export type { EditorContext } from './chatParticipant';
