import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentActivityTimeline } from '../AgentActivityTimeline';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

afterEach(cleanup);

function connectorActivity(name: string, summary: string): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 2,
    status: 'running',
    startedAtMs: 1_000,
    updatedAtMs: 1_900,
    entries: [
      {
        kind: 'tool',
        id: 'tool:conn-1',
        toolCallId: 'conn-1',
        name,
        category: 'connector',
        summary,
        status: 'running',
        input: {},
        startedAtMs: 1_100,
      },
    ],
  };
}

function badgeLetter(container: HTMLElement): string | null | undefined {
  return container.querySelector('[data-badge-kind="letter"]')?.getAttribute('data-badge-letter');
}

describe('AgentActivityTimeline · custom connector badge', () => {
  it('badges an opaque custom connector with the initial of its real display name', () => {
    const { container } = render(
      <AgentActivityTimeline
        activity={connectorActivity(
          'mcp__custom-a1b2c3d4e5__do_thing',
          'Using Acme Logistics connector',
        )}
      />,
    );
    expect(badgeLetter(container)).toBe('A');
  });

  it('reads the display name out of an approval summary too', () => {
    const { container } = render(
      <AgentActivityTimeline
        activity={connectorActivity('mcp__custom-a1b2c3d4e5__do_thing', 'Review Zephyr action')}
      />,
    );
    expect(badgeLetter(container)).toBe('Z');
  });

  it('keeps the generic badge when the server sent no display name', () => {
    const { container } = render(
      <AgentActivityTimeline
        activity={connectorActivity('mcp__custom-a1b2c3d4e5__do_thing', 'Using MCP tool')}
      />,
    );
    expect(badgeLetter(container)).toBe('M');
  });

  it('still falls back to the server id when the summary is an action phrase', () => {
    const { container } = render(
      <AgentActivityTimeline
        activity={connectorActivity('mcp__github__get_pull_request_diff', 'Fetching page')}
      />,
    );
    expect(badgeLetter(container)).toBe('G');
  });
});
