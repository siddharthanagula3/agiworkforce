import { describe, expect, it } from 'vitest';

import {
  TOOL_RISK_TIERS,
  toContractToolDefinition,
  toolExecutionChannel,
  toolExternalDelivery,
  toolRetrySafety,
  toolRiskTier,
} from '../tool-metadata';

describe('named risk tiers', () => {
  it('reads every tool that only observes state as low', () => {
    expect(toolRiskTier('web_search')).toBe('low');
    expect(toolRiskTier('read_file')).toBe('low');
    expect(toolRiskTier('list_files')).toBe('low');
  });

  it('separates an undoable change from one that cannot be undone', () => {
    expect(toolRiskTier('create_folder')).toBe('medium');
    expect(toolRiskTier('write_file')).toBe('high');
    expect(toolRiskTier('execute_code')).toBe('high');
  });

  it('puts something other people can already see at the top tier', () => {
    expect(toolRiskTier('mcp__github__post_issue_comment')).toBe('critical');
    expect(toolRiskTier('mcp__github__post_pull_request_review')).toBe('critical');
  });

  it('treats an undeclared connector tool as an irreversible write, not as unknown-and-fine', () => {
    expect(toolRiskTier('mcp__acme__do-something')).toBe('high');
  });

  it('names every tier in the order it escalates', () => {
    expect([...TOOL_RISK_TIERS]).toEqual(['low', 'medium', 'high', 'critical']);
  });
});

describe('retry safety', () => {
  it('lets a read be retried freely', () => {
    expect(toolRetrySafety('web_search')).toBe('idempotent');
  });

  it('refuses to call a send repeatable, so a charge or a message is not sent twice', () => {
    expect(toolRetrySafety('mcp__github__post_issue_comment')).toBe('at_most_once');
  });

  it('leaves an undeclared tool unknown rather than assuming either way', () => {
    expect(toolRetrySafety('mcp__acme__do-something')).toBe('unknown');
  });

  it('carries the declared safety into the cross-surface tool definition', () => {
    const definition = toContractToolDefinition(
      {
        qualifiedName: 'mcp__github__post_issue_comment',
        serverId: 'github',
        toolName: 'post_issue_comment',
        description: 'Comment on an issue',
        origin: 'connector',
        inputSchema: {},
      },
      'other',
    );

    expect(definition.retrySafety).toBe('at_most_once');
  });
});

describe('draft against send', () => {
  it('names a tool that delivers on the call', () => {
    expect(toolExternalDelivery('mcp__github__post_issue_comment')).toBe('send');
  });

  it('says nothing about a tool that puts nothing in front of another person', () => {
    expect(toolExternalDelivery('web_search')).toBeNull();
  });
});

describe('execution channel', () => {
  it('ranks a structured connector as the connector channel', () => {
    expect(toolExecutionChannel('mcp__gmail__send-email')).toBe('connector');
    expect(toolExecutionChannel('web_search')).toBe('connector');
  });

  it('separates driving a page from moving the pointer', () => {
    expect(toolExecutionChannel('mcp__browser-automation__navigate')).toBe('browser');
    expect(toolExecutionChannel('mcp__screen-vision__click')).toBe('automation');
  });

  it('reads a screen step on the user machine as raw automation', () => {
    expect(toolExecutionChannel('device_click')).toBe('automation');
    expect(toolExecutionChannel('device_screenshot')).toBe('automation');
  });

  it('leaves a file step on the user machine structured', () => {
    expect(toolExecutionChannel('device_read_file')).toBe('connector');
  });
});
