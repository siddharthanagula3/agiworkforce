import { describe, expect, it } from 'vitest';

import {
  connectorToolPermissionsFromEntries,
  EMPTY_CONNECTOR_TOOL_PERMISSIONS,
  LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
  scopeConnectorPermissionsToTurn,
  withDisabledConnectorIds,
} from '../connector-tool-permissions';

describe('withDisabledConnectorIds', () => {
  it('returns the same permissions object when nothing is disabled', () => {
    const permissions = EMPTY_CONNECTOR_TOOL_PERMISSIONS;

    expect(withDisabledConnectorIds(permissions, new Set())).toBe(permissions);
  });

  it('denies every tool of a connector switched off for this conversation', () => {
    const permissions = withDisabledConnectorIds(
      EMPTY_CONNECTOR_TOOL_PERMISSIONS,
      new Set(['notion']),
    );

    expect(permissions.isConnectorToolDenied('notion', 'search')).toBe(true);
    expect(permissions.isConnectorToolDenied('notion', 'create_page')).toBe(true);
    expect(permissions.isDenied('mcp__notion__search')).toBe(true);
  });

  it('leaves a connector not in the disabled set governed by the underlying verdicts', () => {
    const saved = connectorToolPermissionsFromEntries([
      { connectorId: 'github', toolName: 'fetch', level: 'allow' },
    ]);
    const permissions = withDisabledConnectorIds(saved, new Set(['notion']));

    expect(permissions.isConnectorToolDenied('github', 'fetch')).toBe(false);
    expect(permissions.isConnectorToolDenied('notion', 'search')).toBe(true);
  });

  it('still denies a tool the saved verdicts already blocked, independent of the opt-out set', () => {
    const saved = connectorToolPermissionsFromEntries([
      { connectorId: 'notion', toolName: 'delete', level: 'deny' },
    ]);
    const permissions = withDisabledConnectorIds(saved, new Set(['github']));

    expect(permissions.isConnectorToolDenied('notion', 'delete')).toBe(true);
  });

  it('does not deny a tool whose qualified name fails to parse', () => {
    const permissions = withDisabledConnectorIds(
      EMPTY_CONNECTOR_TOOL_PERMISSIONS,
      new Set(['notion']),
    );

    expect(permissions.isDenied('not-a-qualified-name')).toBe(false);
  });

  it('denies the switched-off connector as a whole, so it is never contacted', () => {
    const saved = connectorToolPermissionsFromEntries([
      { connectorId: 'notion', toolName: 'search', level: 'allow' },
    ]);
    const permissions = scopeConnectorPermissionsToTurn(saved, {
      temporary: true,
      disabledConnectorIds: ['notion'],
    });

    expect(permissions.isConnectorDenied('notion')).toBe(true);
    expect(permissions.isConnectorDenied('github')).toBe(false);
  });

  it('denies no connector as a whole on saved per-tool verdicts alone', () => {
    const saved = connectorToolPermissionsFromEntries([
      { connectorId: 'notion', toolName: 'search', level: 'deny' },
    ]);

    expect(saved.isConnectorDenied('notion')).toBe(false);
  });

  it('denies every connector as a whole under lockdown', () => {
    expect(
      withDisabledConnectorIds(
        LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
        new Set(['notion']),
      ).isConnectorDenied('github'),
    ).toBe(true);
  });
});
