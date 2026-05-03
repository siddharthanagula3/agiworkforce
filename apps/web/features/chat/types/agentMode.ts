/**
 * Agent execution mode — controls how proactively the agent takes actions.
 *
 * Extracted from `apps/web/components/UnifiedAgenticChat/AgentModeSwitcher.tsx`
 * (now-deleted 36K-LOC monolith) to a single-source-of-truth type file so that
 * `chat-preferences-store.ts` and any future consumer can import it without
 * dragging in the legacy switcher component.
 *
 * - `safe`: every tool call requires user approval
 * - `standard`: read-only tools auto-approve, mutations require approval
 * - `autopilot`: all tools auto-approve (use with caution)
 */
export type AgentMode = 'safe' | 'standard' | 'autopilot';
