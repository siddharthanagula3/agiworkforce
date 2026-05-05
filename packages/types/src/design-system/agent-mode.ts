// packages/types/src/design-system/agent-mode.ts
import type { Effort } from './effort';

/**
 * Agent operating mode — locked vocabulary across all 6 surfaces.
 * Maps to apps/cli/src/cli_options.rs:19 PermissionMode enum.
 */
export type AgentMode = 'ask' | 'auto' | 'plan' | 'bypass';

export const AGENT_MODE_LABEL: Readonly<Record<AgentMode, string>> = Object.freeze({
  ask: 'Ask before edits',
  auto: 'Edit automatically',
  plan: 'Plan mode',
  bypass: 'Bypass permissions',
});

export const AGENT_MODE_DESCRIPTION: Readonly<Record<AgentMode, string>> = Object.freeze({
  ask: 'Confirm every edit before it runs',
  auto: 'Edits run without confirmation',
  plan: 'Generate a plan; no edits until approved',
  bypass: 'Skip all approval prompts (dangerous)',
});

/**
 * Composer-state contract used by every interactive surface.
 * Per DECISIONS.md D3, scope is per-project with conversation override.
 */
export interface AgentControlState {
  /** Active mode for this conversation. May be project default or overridden. */
  mode: AgentMode;
  /** Active effort level. May be model-default if provider doesn't support effort. */
  effort: Effort;
  /** Temporary chat — does not persist to history. */
  temporaryChat: boolean;
  /** Source of truth — used by UI to show "overriding project default" hint. */
  source: 'project-default' | 'conversation-override';
}
