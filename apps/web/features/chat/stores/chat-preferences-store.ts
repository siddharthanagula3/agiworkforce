/**
 * REMOVED (AUDIT-FIX CMP-18/CMP-19).
 *
 * `useChatPreferencesStore` had exactly ONE occurrence repo-wide -- its own
 * definition -- yet it persisted to localStorage under 'agi-chat-preferences'
 * with a v2 migration and read like an implemented agent-mode feature. None of
 * `agentMode`, `thinkingEnabled`, `preferWhisperCloud`, or
 * `connectorBarDismissed` was ever read or written by a caller:
 *
 *  - `thinkingEnabled` duplicates `@shared/stores/thinking-store` (the live one).
 *  - `preferWhisperCloud` is a real `useVoiceTranscription` option, but no
 *    caller sets it; the hook's own default (`false`) is the behaviour today.
 *    Wiring a cloud-transcription preference is a product decision with a
 *    privacy boundary attached, so it is left unimplemented rather than
 *    half-implemented behind a store nothing reads.
 *  - `agentMode` had no switcher; the `AgentMode` type it imported is likewise
 *    now unreferenced.
 *
 * Contents deleted; the file survives only because the working tree cannot
 * unlink files.
 */
export {};
