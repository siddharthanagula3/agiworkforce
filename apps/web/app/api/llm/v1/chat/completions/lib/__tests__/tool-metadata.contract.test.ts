import { describe, expect, it } from 'vitest';

import {
  isDestructiveToolMetadata,
  isParallelSafeTool,
  policyAutoApprovesTool,
  PLATFORM_TOOL_METADATA,
  resolveToolMetadata,
  toContractToolDefinition,
  UNKNOWN_TOOL_METADATA,
  resolveConnectorToolMetadata,
  toolExternalDelivery,
} from '../tool-metadata';
import { TOOL_ACTION_CLASSES } from '@agiworkforce/types';

describe('web tool metadata declares through the shared contract', () => {
  it('classifies every platform tool with a contract action class', () => {
    for (const metadata of Object.values(PLATFORM_TOOL_METADATA)) {
      expect(TOOL_ACTION_CLASSES).toContain(metadata.actionClass);
    }
    expect(TOOL_ACTION_CLASSES).toContain(UNKNOWN_TOOL_METADATA.actionClass);
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
    // Retrying a posted comment posts it twice, so the send declares its own
    // safety rather than falling through to the unknown default.
    expect(definition.retrySafety).toBe('at_most_once');
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

  it('permits only declared Gmail reads under read-only approval policy', () => {
    for (const tool of [
      'search_threads',
      'get_thread',
      'get_message',
      'list_drafts',
      'list_labels',
    ]) {
      const name = `mcp__gmail__${tool}`;
      expect(resolveConnectorToolMetadata('gmail', tool).actionClass).toBe('read');
      expect(policyAutoApprovesTool('auto_approve_read_only', name)).toBe(true);
      expect(isParallelSafeTool(name)).toBe(true);
    }
    expect(policyAutoApprovesTool('ask_every_time', 'mcp__gmail__get_message')).toBe(false);
    expect(policyAutoApprovesTool('auto_approve_read_only', 'mcp__gmail__send_email')).toBe(false);
    expect(policyAutoApprovesTool('auto_approve_read_only', 'mcp__gmail__label_message')).toBe(
      false,
    );
  });

  it('requires approval and refuses blind retry for Gmail draft creation', () => {
    const definition = toContractToolDefinition(
      {
        qualifiedName: 'mcp__gmail__create_draft',
        serverId: 'gmail',
        toolName: 'create_draft',
        description: 'Create a Gmail draft',
        origin: 'connector',
        inputSchema: { type: 'object' },
      },
      'connector',
    );
    expect(definition.auth).toEqual({ kind: 'connector_grant', connectorId: 'gmail', scopes: [] });
    expect(toolExternalDelivery(definition.name)).toBe('draft');
    expect(definition.retrySafety).toBe('at_most_once');
    expect(isParallelSafeTool(definition.name)).toBe(false);
    expect(policyAutoApprovesTool('auto_approve_read_only', definition.name)).toBe(false);
    expect(policyAutoApprovesTool('autonomous', definition.name)).toBe(false);
  });
});
