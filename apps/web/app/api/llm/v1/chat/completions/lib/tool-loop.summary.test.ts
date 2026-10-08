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

  it('keeps the name-carrying sentence when a remote tool name resembles a platform tool', () => {
    expect(canonicalToolSummary('mcp__github__post_pull_request_review', 'connector')).toBe(
      'Using GitHub connector',
    );
    expect(
      canonicalToolSummary(
        'mcp__custom-a1b2c3d4e5__read_file',
        'connector',
        undefined,
        'Acme Logistics',
      ),
    ).toBe('Using Acme Logistics connector');
    expect(canonicalToolSummary('mcp__filesystem__list_files', 'mcp')).toBe(
      'Using Filesystem tool',
    );
  });

  it('still words a platform tool from the phrase table', () => {
    expect(canonicalToolSummary('read_file', 'filesystem')).toBe('Reading file');
    expect(canonicalToolSummary('url_fetch', 'web-fetch', { url: 'https://example.com/a' })).toBe(
      'Fetching example.com',
    );
    expect(canonicalToolSummary('frobnicate_widget', 'other')).toBe('Running Frobnicate Widget');
  });
});
