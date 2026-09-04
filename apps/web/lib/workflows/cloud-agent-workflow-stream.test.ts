import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { projectCloudAgentWorkflowChunk } from './cloud-agent-workflow-stream';

describe('cloud agent workflow stream projection', () => {
  it('drops legacy wire data and projects canonical public text into one replayable event', () => {
    const envelope = {
      schemaVersion: 4,
      sessionId: 'session-1',
      turnId: 'turn-1',
      sequence: 3,
      emittedAtMs: 1_000,
      event: { type: 'text-delta', delta: 'Visible answer' },
    };
    const chunk = new TextEncoder().encode(
      [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'legacy duplicate' } }] })}`,
        `data: ${JSON.stringify({ choices: [{ delta: { x_agent_event: envelope } }] })}`,
        '',
      ].join('\n'),
    );

    const projected = projectCloudAgentWorkflowChunk(chunk);

    expect(projected).toHaveLength(1);
    expect(projected[0]?.envelope).toEqual(envelope);
    expect(projected[0]?.sse).toContain('"content":"Visible answer"');
    expect(projected[0]?.sse).not.toContain('legacy duplicate');
  });

  it('keeps non-text canonical activity without inventing answer content', () => {
    const chunk = new TextEncoder().encode(
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              x_agent_event: {
                schemaVersion: 4,
                sessionId: 'session-1',
                turnId: 'turn-1',
                sequence: 4,
                emittedAtMs: 1_100,
                event: { type: 'lifecycle', phase: 'heartbeat' },
              },
            },
          },
        ],
      })}\n\n`,
    );

    const projected = projectCloudAgentWorkflowChunk(chunk);

    expect(projected).toHaveLength(1);
    expect(projected[0]?.sse).not.toContain('"content"');
  });

  it('forwards a validated interactive card while leaving it out of the activity journal', () => {
    const card = {
      schemaVersion: 1,
      cardId: 'tool-map-fixture',
      kind: 'map-search.v1',
      createdAt: '2026-08-11T00:00:00.000Z',
      fallback: { headline: 'Map search', text: 'Map search: coffee near Austin' },
      producedBy: { toolCallId: 'tool-map-fixture', toolName: 'search_maps' },
      body: {
        title: 'Coffee near Austin',
        query: 'coffee near Austin',
        actions: [
          {
            provider: 'google_maps',
            label: 'Open in Google Maps',
            url: 'https://www.google.com/maps/search/?api=1&query=coffee%20near%20Austin',
          },
        ],
      },
    };
    const chunk = new TextEncoder().encode(
      `data: ${JSON.stringify({ choices: [{ delta: { x_interactive_card: { card } } }] })}\n\n`,
    );

    const projected = projectCloudAgentWorkflowChunk(chunk);

    expect(projected).toHaveLength(1);
    expect(projected[0]?.envelope).toBeUndefined();
    expect(projected[0]?.sse).toContain('"x_interactive_card"');
    expect(projected[0]?.sse).toContain('tool-map-fixture');
  });

  it('forwards tool status and search results deltas untouched', () => {
    const toolStatus = { type: 'mcp_tool_use', name: 'web_search', status: 'running' };
    const searchResults = { content: [{ type: 'web_search_result', url: 'https://example.com' }] };
    const chunk = new TextEncoder().encode(
      [
        `data: ${JSON.stringify({ choices: [{ delta: { x_tool_status: toolStatus } }] })}`,
        `data: ${JSON.stringify({ choices: [{ delta: { x_search_results: searchResults } }] })}`,
        '',
      ].join('\n'),
    );

    const projected = projectCloudAgentWorkflowChunk(chunk);

    expect(projected).toHaveLength(2);
    expect(projected[0]?.envelope).toBeUndefined();
    expect(projected[0]?.sse).toContain('"x_tool_status"');
    expect(projected[0]?.sse).toContain('web_search');
    expect(projected[1]?.sse).toContain('"x_search_results"');
    expect(projected[1]?.sse).toContain('example.com');
  });

  it('forwards unrecognized activity delta types without an allowlist entry', () => {
    const chunk = new TextEncoder().encode(
      `data: ${JSON.stringify({
        choices: [{ delta: { x_research_status: { phase: 'planning' } } }],
      })}\n\n`,
    );

    const projected = projectCloudAgentWorkflowChunk(chunk);

    expect(projected).toHaveLength(1);
    expect(projected[0]?.sse).toContain('"x_research_status"');
  });

  it('preserves the original interleaving of tool status and canonical agent events', () => {
    const envelope = {
      schemaVersion: 4,
      sessionId: 'session-1',
      turnId: 'turn-1',
      sequence: 7,
      emittedAtMs: 2_000,
      event: { type: 'lifecycle', phase: 'heartbeat' },
    };
    const toolStatus = { type: 'mcp_tool_use', name: 'web_search', status: 'completed' };
    const chunk = new TextEncoder().encode(
      [
        `data: ${JSON.stringify({ choices: [{ delta: { x_tool_status: toolStatus } }] })}`,
        `data: ${JSON.stringify({ choices: [{ delta: { x_agent_event: envelope } }] })}`,
        '',
      ].join('\n'),
    );

    const projected = projectCloudAgentWorkflowChunk(chunk);

    expect(projected).toHaveLength(2);
    expect(projected[0]?.sse).toContain('"x_tool_status"');
    expect(projected[1]?.envelope).toEqual(envelope);
  });

  it('drops a content delta that carries no other forwardable key', () => {
    const chunk = new TextEncoder().encode(
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'partial token' } }] })}\n\n`,
    );

    const projected = projectCloudAgentWorkflowChunk(chunk);

    expect(projected).toHaveLength(0);
  });
});
