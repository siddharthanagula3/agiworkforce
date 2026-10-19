import { describe, expect, it } from 'vitest';
import {
  NEW_AGENT_DRAFT,
  addAgentConversationStarter,
  agentDraftFromAgent,
  agentDraftProblem,
  agentDraftsEqual,
  agentSelectionIncludes,
  agentStateLabel,
  managedCloudAgentPath,
  parseAgentDailyTurnLimit,
  toggleAgentSelection,
} from '../agent-drafts';
import { AGENT_DAILY_TURN_LIMIT_MAX, AGENT_STARTERS_MAX, type ManagedCloudAgent } from '../agents';

const AGENT: ManagedCloudAgent = {
  ...NEW_AGENT_DRAFT,
  name: 'Researcher',
  id: '7d1b5c1e-0b3f-4a43-9a43-6b1d0f2b5f11',
  isOwner: true,
  ownerName: null,
  organizationId: null,
  status: 'active',
  visibility: 'private',
  publishedVersion: 2,
  hasUnpublishedChanges: true,
  pausedAt: null,
  retiredAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
};

describe('agent drafts', () => {
  it('copies only the config fields from an agent and compares by value', () => {
    const draft = agentDraftFromAgent(AGENT);
    expect(draft).not.toHaveProperty('id');
    expect(draft.name).toBe('Researcher');
    expect(agentDraftsEqual(draft, { ...draft })).toBe(true);
    expect(agentDraftsEqual(draft, { ...draft, conversationStarters: ['Hi'] })).toBe(false);
  });

  it('requires a name', () => {
    expect(agentDraftProblem(NEW_AGENT_DRAFT)).toBe('Give the agent a name.');
    expect(agentDraftProblem({ ...NEW_AGENT_DRAFT, name: 'A' })).toBeNull();
  });

  it('labels the state an owner and a recipient see', () => {
    expect(agentStateLabel(AGENT)).toBe('Only you · Unpublished changes');
    expect(agentStateLabel({ ...AGENT, publishedVersion: null })).toBe('Draft');
    expect(agentStateLabel({ ...AGENT, status: 'paused' })).toBe('Paused');
    expect(agentStateLabel({ ...AGENT, isOwner: false, ownerName: 'Ana' })).toBe('Shared by Ana');
  });

  it('turns an all selection into an explicit list when one option is unchecked', () => {
    expect(toggleAgentSelection(null, ['a', 'b', 'c'], 'b', false)).toEqual(['a', 'c']);
    expect(toggleAgentSelection(['a'], ['a', 'b'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleAgentSelection(['a'], ['a', 'b'], 'a', true)).toEqual(['a']);
    expect(agentSelectionIncludes(null, 'x')).toBe(true);
    expect(agentSelectionIncludes(['a'], 'x')).toBe(false);
  });

  it('clamps the daily message budget and treats blank as no limit', () => {
    expect(parseAgentDailyTurnLimit('')).toBeNull();
    expect(parseAgentDailyTurnLimit('0')).toBeNull();
    expect(parseAgentDailyTurnLimit('25')).toBe(25);
    expect(parseAgentDailyTurnLimit(String(AGENT_DAILY_TURN_LIMIT_MAX + 5))).toBe(
      AGENT_DAILY_TURN_LIMIT_MAX,
    );
  });

  it('adds trimmed, unique conversation starters up to the cap', () => {
    expect(addAgentConversationStarter([], '  Plan my week ')).toEqual(['Plan my week']);
    expect(addAgentConversationStarter(['Plan my week'], 'Plan my week')).toEqual(['Plan my week']);
    const full = Array.from({ length: AGENT_STARTERS_MAX }, (_, index) => `s${index}`);
    expect(addAgentConversationStarter(full, 'more')).toEqual(full);
  });

  it('builds encoded agent paths', () => {
    expect(managedCloudAgentPath('a b', 'files/x')).toBe('/api/custom-agents/a%20b/files/x');
  });
});
