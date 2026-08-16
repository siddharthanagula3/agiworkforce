import type { Effort } from './effort';

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

export interface AgentControlState {
  mode: AgentMode;
  effort: Effort;
  temporaryChat: boolean;
  source: 'project-default' | 'conversation-override';
}
