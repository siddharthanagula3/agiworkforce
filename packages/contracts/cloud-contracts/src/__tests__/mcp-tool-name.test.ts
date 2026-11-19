import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_DISPLAY_NAMES,
  CONNECTOR_RISK_CLASSES,
  catalogConnectorName,
} from '../connector-trust-copy';
import {
  CUSTOM_CONNECTOR_LABEL,
  describeMcpTool,
  isCustomConnectorServerId,
  mcpServerLabel,
  parseQualifiedMcpToolName,
} from '../mcp-tool-name';

describe('connector display names', () => {
  it('names every catalog connector and nothing else', () => {
    expect(Object.keys(CONNECTOR_DISPLAY_NAMES).sort()).toEqual(
      Object.keys(CONNECTOR_RISK_CLASSES).sort(),
    );
    expect(catalogConnectorName('github')).toBe('GitHub');
    expect(catalogConnectorName('hubspot')).toBe('HubSpot');
    expect(catalogConnectorName('constructor')).toBeNull();
  });
});

describe('qualified MCP tool names', () => {
  it('splits the server and the tool, and rejects other names', () => {
    expect(parseQualifiedMcpToolName('mcp__github__create_issue')).toEqual({
      serverId: 'github',
      toolName: 'create_issue',
    });
    expect(parseQualifiedMcpToolName('web_search')).toBeNull();
    expect(parseQualifiedMcpToolName('mcp____tool')).toBeNull();
  });

  it('labels a catalog server by its product name, a custom one generically, else by id', () => {
    expect(mcpServerLabel('github')).toBe('GitHub');
    expect(isCustomConnectorServerId('custom-1234')).toBe(true);
    expect(mcpServerLabel('custom-1234')).toBe(CUSTOM_CONNECTOR_LABEL);
    expect(mcpServerLabel('acme-internal')).toBe('acme-internal');
  });

  it('describes a tool with the server label and a readable tool label', () => {
    expect(describeMcpTool('mcp__github__create_pull-request')).toEqual({
      serverId: 'github',
      toolName: 'create_pull-request',
      serverLabel: 'GitHub',
      toolLabel: 'Create Pull Request',
      label: 'GitHub · Create Pull Request',
    });
    expect(describeMcpTool('read_file')).toBeNull();
  });
});
