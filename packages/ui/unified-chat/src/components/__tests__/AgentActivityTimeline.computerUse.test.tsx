import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentActivityTimeline } from '../AgentActivityTimeline';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

afterEach(cleanup);

const SCREENSHOT = 'data:image/png;base64,AAAA';

function screenActivity(
  name: string,
  input: Record<string, unknown>,
  deviceName?: string,
): AgentActivityState {
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
        id: 'tool:step-1',
        toolCallId: 'step-1',
        name,
        category: 'computer-use',
        summary: 'Working on your screen',
        status: 'completed',
        input,
        startedAtMs: 1_100,
        ...(deviceName
          ? { deviceStep: { deviceId: 'dev-1', deviceName, expiresAtMs: 9_000 } }
          : {}),
      },
    ],
  };
}

describe('AgentActivityTimeline · computer-use steps', () => {
  it('says what the step did to the screen, from its own arguments', () => {
    render(
      <AgentActivityTimeline
        defaultExpanded
        activity={screenActivity('device_click', { x: 812, y: 344, count: 2 })}
      />,
    );

    expect(screen.getByTestId('computer-use-step').textContent).toContain(
      'Double-clicked at 812, 344',
    );
  });

  it('quotes what was typed, shortened rather than dumped', () => {
    render(
      <AgentActivityTimeline
        defaultExpanded
        activity={screenActivity('device_type', { text: 'hello there' })}
      />,
    );

    expect(screen.getByTestId('computer-use-step').textContent).toContain(
      'Typed \u201chello there\u201d',
    );
  });

  it('names the machine the step ran on', () => {
    render(
      <AgentActivityTimeline
        defaultExpanded
        activity={screenActivity('device_key', { key: 'Enter' }, 'Sid’s MacBook')}
      />,
    );

    expect(screen.getByTestId('computer-use-step').textContent).toContain('Pressed Enter');
    expect(screen.getByTestId('computer-use-step').textContent).toContain('Sid\u2019s MacBook');
  });

  it('shows the picture the step returned, described by what it did', () => {
    render(
      <AgentActivityTimeline
        defaultExpanded
        activity={screenActivity('device_screenshot', {})}
        screenshotFor={(toolCallId) => (toolCallId === 'step-1' ? SCREENSHOT : undefined)}
      />,
    );

    const image = screen.getByTestId('computer-use-screenshot');
    expect(image.getAttribute('src')).toBe(SCREENSHOT);
    expect(image.getAttribute('alt')).toBe('Screen after: Looked at the screen');
  });

  it('renders the step without an image on a surface that did not take the shot', () => {
    render(
      <AgentActivityTimeline
        defaultExpanded
        activity={screenActivity('device_move', { x: 1, y: 2 })}
      />,
    );

    expect(screen.getByTestId('computer-use-step')).not.toBeNull();
    expect(screen.queryByTestId('computer-use-screenshot')).toBeNull();
  });

  it('leaves an ordinary tool row alone', () => {
    const activity = screenActivity('device_click', { x: 1, y: 2 });
    const entry = activity.entries[0];
    if (entry && entry.kind === 'tool') entry.category = 'web-search';

    render(<AgentActivityTimeline defaultExpanded activity={activity} />);

    expect(screen.queryByTestId('computer-use-step')).toBeNull();
  });
});
