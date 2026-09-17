import { describe, expect, it } from 'vitest';

import {
  connectorToolPermissionsFromEntries,
  LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
  withDisabledConnectorIds,
  withoutStandingApprovals,
} from '../connector-tool-permissions';

const SAVED = connectorToolPermissionsFromEntries([
  { connectorId: 'github', toolName: 'fetch', level: 'allow' },
  { connectorId: 'notion', toolName: 'search', level: 'ask' },
  { connectorId: 'notion', toolName: 'delete', level: 'deny' },
]);

describe('withoutStandingApprovals · Temporary Chat connector policy', () => {
  it('turns a standing always-allow into an approval prompt for this chat', () => {
    const temporary = withoutStandingApprovals(SAVED);

    expect(SAVED.levelForConnectorTool('github', 'fetch')).toBe('allow');
    expect(temporary.levelForConnectorTool('github', 'fetch')).toBe('ask');
    expect(temporary.levelFor('mcp__github__fetch')).toBe('ask');
  });

  it('leaves a blocked tool blocked, so a temporary chat is not a way around a denial', () => {
    const temporary = withoutStandingApprovals(SAVED);

    expect(temporary.levelForConnectorTool('notion', 'delete')).toBe('deny');
    expect(temporary.isConnectorToolDenied('notion', 'delete')).toBe(true);
    expect(temporary.isDenied('mcp__notion__delete')).toBe(true);
  });

  it('leaves a tool that already asked alone', () => {
    expect(withoutStandingApprovals(SAVED).levelForConnectorTool('notion', 'search')).toBe('ask');
  });

  it('reports the downgraded verdicts in its entries, not the saved ones', () => {
    const entries = withoutStandingApprovals(SAVED).entries;

    expect(entries.find((entry) => entry.toolName === 'fetch')?.level).toBe('ask');
    expect(entries.find((entry) => entry.toolName === 'delete')?.level).toBe('deny');
  });

  it('does not change what the account chose: the saved verdicts are untouched', () => {
    withoutStandingApprovals(SAVED);

    expect(SAVED.levelForConnectorTool('github', 'fetch')).toBe('allow');
  });

  it('composes with the per-conversation connector opt-out', () => {
    const temporary = withDisabledConnectorIds(
      withoutStandingApprovals(SAVED),
      new Set(['github']),
    );

    expect(temporary.isConnectorToolDenied('github', 'fetch')).toBe(true);
    expect(temporary.levelForConnectorTool('notion', 'search')).toBe('ask');
  });

  it('keeps lockdown absolute', () => {
    const temporary = withoutStandingApprovals(LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS);

    expect(temporary.isConnectorToolDenied('github', 'fetch')).toBe(true);
    expect(temporary.levelFor('mcp__github__fetch')).toBe('deny');
  });
});
