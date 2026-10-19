import {
  AgentConfigSchema,
  type AgentConfig,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';

export const NEW_AGENT_DRAFT: AgentConfig = {
  name: '',
  description: '',
  icon: 'sparkles',
  accentColor: 'zinc',
  instructions: '',
  outputExamples: '',
  conversationStarters: [],
  model: null,
  webSearch: true,
  codeExecution: true,
  imageGeneration: true,
  connectorIds: null,
  skillNames: null,
  dailyTurnLimit: null,
  monthlyCreditLimit: null,
};

const CONFIG_KEYS = Object.keys(AgentConfigSchema.shape) as (keyof AgentConfig)[];

export function draftFromAgent(agent: ManagedCloudAgent): AgentConfig {
  return Object.fromEntries(CONFIG_KEYS.map((key) => [key, agent[key]])) as AgentConfig;
}

export function draftsEqual(left: AgentConfig, right: AgentConfig): boolean {
  return CONFIG_KEYS.every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

export function draftProblem(draft: AgentConfig): string | null {
  if (!draft.name.trim()) return 'Give the agent a name.';
  return null;
}
