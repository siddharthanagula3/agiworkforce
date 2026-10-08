import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  connectorToolPermissionsFromEntries,
  LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
} from '../connector-tool-permissions';
import { scopeResearchConnectors } from '../research-run-options';
import type { ProcessedRequest } from '../request-processor';

type ResearchTurn = Parameters<typeof scopeResearchConnectors>[0];

function turn(overrides: {
  picked: string[];
  disabled?: string[];
  temporary?: boolean;
}): ResearchTurn {
  return {
    chatRequest: {
      disabled_connector_ids: overrides.disabled,
    } as ProcessedRequest['chatRequest'],
    conversationIsTemporary: overrides.temporary ?? false,
    researchSources: { connectors: overrides.picked } as ProcessedRequest['researchSources'],
  };
}

describe('scopeResearchConnectors', () => {
  it('does not read a picked connector this chat switched off', () => {
    const scoped = scopeResearchConnectors(
      turn({ picked: ['notion', 'linear'], disabled: ['notion'] }),
      connectorToolPermissionsFromEntries([]),
    );

    expect(scoped.connectorIds).toEqual(['linear']);
    expect(scoped.permissions.isConnectorToolDenied('notion', 'search')).toBe(true);
  });

  it('reads nothing from connectors under lockdown', () => {
    const scoped = scopeResearchConnectors(
      turn({ picked: ['notion'] }),
      LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
    );

    expect(scoped.connectorIds).toEqual([]);
  });

  it('turns a saved allow into an ask in a temporary chat', () => {
    const scoped = scopeResearchConnectors(
      turn({ picked: ['notion'], temporary: true }),
      connectorToolPermissionsFromEntries([
        { connectorId: 'notion', toolName: 'search', level: 'allow' },
      ]),
    );

    expect(scoped.connectorIds).toEqual(['notion']);
    expect(scoped.permissions.levelForConnectorTool('notion', 'search')).toBe('ask');
  });
});
