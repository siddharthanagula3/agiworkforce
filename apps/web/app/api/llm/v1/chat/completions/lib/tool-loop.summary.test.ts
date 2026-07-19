import { describe, expect, it } from 'vitest';
import { canonicalToolSummary } from './tool-loop';

/**
 * The activity-feed summary line for MCP tools. A user's custom remote connector
 * has an opaque `custom-<hex>` serverId that carries no human name — humanizing
 * it would leak an internal id ("Using Custom A1b2c3d4e5 connector"). Named
 * servers (github, operator MCP) keep their humanized label.
 */
describe('canonicalToolSummary — MCP connectors', () => {
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
});
