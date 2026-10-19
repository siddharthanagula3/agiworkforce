import type { ManagedCloudAgent } from '@agiworkforce/cloud-contracts';

export const AGENTS_HREF = '/chat/agents';
export const NEW_AGENT_HREF = `${AGENTS_HREF}/new`;

export function agentHref(agentId: string): string {
  return `${AGENTS_HREF}/${encodeURIComponent(agentId)}`;
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
