import { describe, expect, it } from 'vitest';

import {
  isDestructiveToolMetadata,
  isParallelSafeTool,
  PLATFORM_TOOL_METADATA,
  resolveToolMetadata,
  toContractToolDefinition,
  UNKNOWN_TOOL_METADATA,
} from '../tool-metadata';
import { isToolActionClass, TOOL_ACTION_CLASSES } from '@agiworkforce/types';

describe('web tool metadata declares through the shared contract', () => {
  it('classifies every platform tool with a contract action class', () => {
    for (const metadata of Object.values(PLATFORM_TOOL_METADATA)) {
      expect(isToolActionClass(metadata.actionClass)).toBe(true);
    }
    expect(isToolActionClass(UNKNOWN_TOOL_METADATA.actionClass)).toBe(true);
    expect(TOOL_ACTION_CLASSES).toContain(resolveToolMetadata('web_search').actionClass);
  });

  it('keeps the destructiveness and parallel-safety verdicts it had before', () => {
    expect(isDestructiveToolMetadata(resolveToolMetadata('web_search'))).toBe(false);
    expect(isDestructiveToolMetadata(resolveToolMetadata('mcp__github__post_issue_comment'))).toBe(
      true,
    );
    expect(isDestructiveToolMetadata(resolveToolMetadata('create_folder'))).toBe(false);
    expect(isDestructiveToolMetadata(resolveToolMetadata('write_file'))).toBe(true);
    expect(isParallelSafeTool('web_search')).toBe(true);
    expect(isParallelSafeTool('write_file')).toBe(false);
    expect(isParallelSafeTool('mcp__acme__anything')).toBe(false);
  });

  it('renders a platform tool as a declared contract definition', () => {
    const definition = toContractToolDefinition(
      {
        qualifiedName: 'web_search',
        serverId: 'platform',
        toolName: 'web_search',
        description: 'Search the web',
        inputSchema: { type: 'object' },
      },
      'web-search',
    );
    expect(definition.declared).toBe(true);
    expect(definition.actionClass).toBe('read');
    expect(definition.createsEgressPath).toBe(true);
    expect(definition.auth).toEqual({ kind: 'user_session', scopes: [] });
    expect(definition.retrySafety).toBe('idempotent');
  });

  it('renders a connector tool as gated on that connector grant', () => {
    const definition = toContractToolDefinition(
      {
        qualifiedName: 'mcp__github__post_issue_comment',
        serverId: 'github',
        toolName: 'post_issue_comment',
        description: 'Comment on an issue',
        origin: 'connector',
        inputSchema: { type: 'object' },
      },
      'connector',
    );
    expect(definition.actionClass).toBe('external_send');
    expect(definition.auth).toEqual({
      kind: 'connector_grant',
      connectorId: 'github',
      scopes: [],
    });
    expect(definition.retrySafety).toBe('unknown');
  });

  it('renders an undeclared operator tool with the unknown-tool defaults', () => {
    const definition = toContractToolDefinition(
      {
        qualifiedName: 'mcp__acme__publish',
        serverId: 'acme',
        toolName: 'publish',
        description: 'Publish',
        inputSchema: { type: 'object' },
      },
      'mcp',
    );
    expect(definition.declared).toBe(false);
    expect(definition.actionClass).toBe(UNKNOWN_TOOL_METADATA.actionClass);
    expect(definition.acceptsUntrustedContent).toBe(true);
    expect(definition.createsEgressPath).toBe(true);
  });
});
