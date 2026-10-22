import type { AgentConfig } from '@agiworkforce/cloud-contracts';

import type { AgentRow } from '@/lib/services/custom-agent-service';

export const OWNER = 'user_owner';
export const TEAMMATE = 'user_teammate';
export const AGENT_ID = '0190a000-0000-7000-8000-0000000000a1';

export function agentConfig(patch: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: 'Release notes writer',
    description: 'Turns merged pull requests into release notes',
    icon: 'file-text',
    accentColor: 'sky',
    instructions: 'Group changes by area and lead with what users notice.',
    outputExamples: '## Fixes\n- Search no longer drops the last word',
    conversationStarters: ['Draft this week’s notes'],
    model: null,
    webSearch: true,
    codeExecution: true,
    imageGeneration: true,
    connectorIds: null,
    skillNames: null,
    allowedWebDomains: [],
    blockedWebDomains: [],
    dailyTurnLimit: null,
    monthlyCreditLimit: null,
    ...patch,
  };
}

export function agentRow(
  patch: Partial<AgentRow> = {},
  config: Partial<AgentConfig> = {},
): AgentRow {
  const c = agentConfig(config);
  return {
    id: AGENT_ID,
    user_id: OWNER,
    organization_id: '0190a000-0000-7000-8000-0000000000f1',
    name: c.name,
    description: c.description,
    icon: c.icon,
    accent_color: c.accentColor,
    instructions: c.instructions,
    output_examples: c.outputExamples,
    conversation_starters: c.conversationStarters,
    model: c.model,
    web_search: c.webSearch,
    code_execution: c.codeExecution,
    image_generation: c.imageGeneration,
    connector_ids: c.connectorIds,
    skill_names: c.skillNames,
    allowed_web_domains: c.allowedWebDomains,
    blocked_web_domains: c.blockedWebDomains,
    daily_turn_limit: c.dailyTurnLimit,
    monthly_credit_limit: c.monthlyCreditLimit,
    status: 'active',
    visibility: 'private',
    published_version: null,
    paused_at: null,
    retired_at: null,
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
    published_config: null,
    ...patch,
  };
}
