/**
 * Client network deadlines shared by Web features.
 *
 * A chat-row write is a short control-plane request, not a provider
 * generation. Thirty seconds leaves room for the persistence client's bounded
 * retries while ensuring a half-open connection reaches visible recovery
 * instead of pinning an optimistic turn forever.
 */
export const CHAT_MESSAGE_PERSISTENCE_TIMEOUT_MS = 30_000;
