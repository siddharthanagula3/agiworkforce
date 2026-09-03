import { describe, expect, it } from 'vitest';
import { canonicalToolSummary } from './tool-loop';

describe('canonicalToolSummary, MCP connectors', () => {
  it('uses a named connector server label', () => {
    expect(canonicalToolSummary('mcp__github__get_pull_request_diff', 'connector')).toBe(
      'Using GitHub connector',
    );
  });

  it('does not leak the opaque custom-<id> serverId into the connector summary', () => {
    const summary = canonicalToolSummary('mcp__custom-a1b2c3d4e5__do_thing', 'connector');
    expect(summary).toBe('Using connector');
    expect(summary).not.toMatch(/custom-|a1b2c3d4e5/i);
  });

  it('does not leak the opaque custom-<id> serverId into the mcp-tool summary either', () => {
    const summary = canonicalToolSummary('mcp__custom-a1b2c3d4e5__do_thing', 'mcp');
    expect(summary).toBe('Using MCP tool');
    expect(summary).not.toMatch(/custom-|a1b2c3d4e5/i);
  });

  it('uses the connector display name when supplied (custom connector real name)', () => {
    const summary = canonicalToolSummary(
      'mcp__custom-a1b2c3d4e5__do_thing',
      'connector',
      undefined,
      'Notion',
    );
    expect(summary).toBe('Using Notion connector');
    expect(summary).not.toMatch(/custom-|a1b2c3d4e5/i);
  });
});
