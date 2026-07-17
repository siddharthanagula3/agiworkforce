/**
 * features/chat-participant/ — @agi chat participant registered in VS Code Chat panel.
 * Handles /explain /fix /refactor /tests /docs /model slash commands.
 * Streams workspace-scoped developer sessions from the local AGI app-server.
 */
export {
  createChatHandler,
  registerChatParticipant,
  buildRuntimeTurnInput,
  buildUserMessage,
  gatherEditorContext,
  isExecutionConfirmation,
  localThreadIdFromHistory,
} from './chatParticipant';
export type { EditorContext } from './chatParticipant';
