import { describe, expect, it } from 'vitest';
import {
  MCP_REPLAY_ARGUMENTS_MAX_CHARS,
  replayMcpContext,
  summarizeMcpContext,
} from './mcp-context-summary';

describe('summarizeMcpContext', () => {
  it('returns nothing when no context was selected', () => {
    expect(summarizeMcpContext(undefined)).toBeUndefined();
    expect(summarizeMcpContext({ resources: [] })).toBeUndefined();
  });

  it('keeps prompt arguments so the turn can be replayed', () => {
    expect(
      summarizeMcpContext({
        prompt: { connectorId: 'c1', name: 'review', arguments: { file: 'a.ts' } },
      }),
    ).toEqual({ prompt: { connectorId: 'c1', name: 'review', arguments: { file: 'a.ts' } } });
  });

  it('flags arguments that are too long to keep rather than dropping them silently', () => {
    const summary = summarizeMcpContext({
      prompt: {
        connectorId: 'c1',
        name: 'review',
        arguments: { body: 'x'.repeat(MCP_REPLAY_ARGUMENTS_MAX_CHARS) },
      },
    });
    expect(summary?.prompt).toEqual({
      connectorId: 'c1',
      name: 'review',
      argumentsOmitted: true,
    });
  });
});

describe('replayMcpContext', () => {
  it('replays the selected resources and prompt with their arguments', () => {
    const selection = {
      prompt: { connectorId: 'c1', name: 'review', arguments: { file: 'a.ts' } },
      resources: [{ connectorId: 'c2', uri: 'file:///notes.md', name: 'notes' }],
    };

    expect(replayMcpContext(summarizeMcpContext(selection))).toEqual({
      ok: true,
      mcpContext: selection,
    });
  });

  it('has nothing to replay for a turn that selected no context', () => {
    expect(replayMcpContext(undefined)).toEqual({ ok: true });
  });

  it('refuses instead of replaying a prompt whose arguments were not kept', () => {
    const result = replayMcpContext({
      prompt: { connectorId: 'c1', name: 'review', argumentsOmitted: true },
    });

    expect(result.ok).toBe(false);
  });
});
