import { describe, expect, it } from 'vitest';

import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import type { SemanticDecisionScope } from '@/lib/services/semantic-decisions/shadow';
import { toolSchemaBudgetFor } from '../tool-schema-loader';
import { toolShortlistShadowInput } from '../tool-shortlist-shadow';

function tool(serverId: string, toolName: string, description: string): WebMcpToolDef {
  return {
    qualifiedName: `mcp__${serverId}__${toolName}`,
    serverId,
    toolName,
    description,
    serverLabel: serverId,
    inputSchema: { type: 'object', properties: {} },
  };
}

const TOOLS = [
  tool('github', 'get_pull_request_diff', 'Read the diff of a pull request.'),
  tool('slack', 'post_channel_message', 'Post a message into a channel.'),
  tool('jira', 'create_issue', 'File a ticket on a board.'),
];

const SCOPE = { requestId: 'request-1' } as SemanticDecisionScope;

function derivedFor(mode: 'auto' | 'on_demand' | 'always') {
  return toolShortlistShadowInput({
    scope: SCOPE,
    tools: TOOLS,
    turnText: () => 'read the pull request diff for me',
    budget: toolSchemaBudgetFor(mode),
  }).derive();
}

describe('toolShortlistShadowInput measures against the account’s own budget', () => {
  it('keeps Auto as the relevance-ranked baseline', () => {
    const turn = derivedFor('auto');
    expect(turn.baselineQualifiedNames).toEqual(['mcp__github__get_pull_request_diff']);
    expect(turn.budget).toEqual(toolSchemaBudgetFor('auto'));
  });

  it('compares On demand with the empty selection the turn really sent', () => {
    const turn = derivedFor('on_demand');
    expect(turn.baselineQualifiedNames).toEqual([]);
    expect(turn.budget).toEqual(toolSchemaBudgetFor('on_demand'));
  });

  it('compares Always with every tool the turn really sent', () => {
    const turn = derivedFor('always');
    expect([...turn.baselineQualifiedNames].sort()).toEqual(
      TOOLS.map((entry) => entry.qualifiedName).sort(),
    );
    expect(turn.budget).toEqual(toolSchemaBudgetFor('always'));
  });

  it('offers every tool as a candidate whatever the budget', () => {
    for (const mode of ['auto', 'on_demand', 'always'] as const) {
      expect(derivedFor(mode).candidates.map((entry) => entry.qualifiedName)).toEqual(
        TOOLS.map((entry) => entry.qualifiedName),
      );
    }
  });
});
