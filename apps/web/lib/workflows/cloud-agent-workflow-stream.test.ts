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
});
