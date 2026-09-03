import { describe, expect, it } from 'vitest';

import {
  connectorToolPermissionsFromEntries,
  EMPTY_CONNECTOR_TOOL_PERMISSIONS,
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
});
