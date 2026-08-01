/**
 * archived-chats — the Cloud conversations this account has archived, and the
 * ability to restore or delete them. Mirrors the web Settings → Archived chats
 * section against the same endpoints.
 */
export {
  archiveAllConversations,
  archiveConversation,
  deleteAllArchivedConversations,
  deleteAllConversations,
  deleteArchivedConversation,
  fetchArchivedConversations,
  restoreArchivedConversation,
  type ArchivedConversation,
  type ArchivedConversationPage,
} from './service';
