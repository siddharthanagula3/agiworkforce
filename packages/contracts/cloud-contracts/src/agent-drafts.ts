import {
  AGENT_DAILY_TURN_LIMIT_MAX,
  AGENT_STARTERS_MAX,
  AgentConfigSchema,
  MANAGED_CLOUD_AGENTS_PATH,
  type AgentConfig,
  type ManagedCloudAgent,
} from './agents';

export const NEW_AGENT_DRAFT: AgentConfig = {
  name: '',
  description: '',
  icon: 'sparkles',
  accentColor: 'zinc',
  instructions: '',
  outputExamples: '',
  conversationStarters: [],
  model: null,
  effort: null,
  webSearch: true,
  codeExecution: true,
  imageGeneration: true,
  connectorIds: null,
  skillNames: null,
  allowedWebDomains: [],
  blockedWebDomains: [],
  dailyTurnLimit: null,
  monthlyCreditLimit: null,
};

const AGENT_CONFIG_KEYS = Object.keys(AgentConfigSchema.shape) as (keyof AgentConfig)[];

export function agentDraftFromAgent(agent: ManagedCloudAgent): AgentConfig {
  return Object.fromEntries(AGENT_CONFIG_KEYS.map((key) => [key, agent[key]])) as AgentConfig;
}

export function agentDraftsEqual(left: AgentConfig, right: AgentConfig): boolean {
  return AGENT_CONFIG_KEYS.every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

export function agentDraftProblem(draft: AgentConfig): string | null {
  if (!draft.name.trim()) return 'Give the agent a name.';
  return null;
}

export function agentCanChat(agent: Pick<ManagedCloudAgent, 'status'>): boolean {
  return agent.status === 'active';
}

export function agentStateLabel(
  agent: Pick<
    ManagedCloudAgent,
    'status' | 'isOwner' | 'publishedVersion' | 'hasUnpublishedChanges' | 'visibility' | 'ownerName'
  >,
): string {
  if (agent.status === 'paused') return 'Paused';
  if (agent.status === 'retired') return 'Retired';
  if (!agent.isOwner) return agent.ownerName ? `Shared by ${agent.ownerName}` : 'Shared with you';
  if (agent.publishedVersion === null) return 'Draft';
  const sharing =
    agent.visibility === 'workspace'
      ? 'Shared with workspace'
      : agent.visibility === 'people'
        ? 'Shared with people'
        : 'Only you';
  return agent.hasUnpublishedChanges ? `${sharing} · Unpublished changes` : sharing;
}

export function managedCloudAgentPath(agentId: string, leaf = ''): string {
  return `${MANAGED_CLOUD_AGENTS_PATH}/${encodeURIComponent(agentId)}${leaf ? `/${leaf}` : ''}`;
}

export function toggleAgentSelection(
  selected: readonly string[] | null,
  optionIds: readonly string[],
  choice: string,
  included: boolean,
): string[] {
  const base = selected ?? optionIds;
  if (included) return base.includes(choice) ? [...base] : [...base, choice];
  return base.filter((value) => value !== choice);
}

export function agentSelectionIncludes(selected: readonly string[] | null, id: string): boolean {
  return selected === null || selected.includes(id);
}

export function parseAgentDailyTurnLimit(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, AGENT_DAILY_TURN_LIMIT_MAX) : null;
}

export function addAgentConversationStarter(
  starters: readonly string[],
  starter: string,
): string[] {
  const trimmed = starter.trim();
  if (!trimmed || starters.length >= AGENT_STARTERS_MAX || starters.includes(trimmed)) {
    return [...starters];
  }
  return [...starters, trimmed];
}
