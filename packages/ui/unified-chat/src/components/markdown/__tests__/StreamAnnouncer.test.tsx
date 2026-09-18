import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StreamAnnouncer, STREAM_ANNOUNCE_INTERVAL_MS } from '../StreamAnnouncer';

function announcer(): HTMLElement {
  return screen.getByTestId('stream-announcer');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('StreamAnnouncer announcements', () => {
  it('announces nothing until a tick has passed, however many tokens arrive', () => {
    const { rerender } = render(
      <StreamAnnouncer text="" isStreaming>
        <p>body</p>
      </StreamAnnouncer>,
    );

    for (const text of ['The ', 'The runway ', 'The runway is ', 'The runway is eleven ']) {
      rerender(
        <StreamAnnouncer text={text} isStreaming>
          <p>body</p>
        </StreamAnnouncer>,
      );
    }

    expect(announcer().textContent).toBe('');
  });

  it('announces once per interval rather than once per token', () => {
    const { rerender } = render(
      <StreamAnnouncer text="The " isStreaming>
        <p>body</p>
      </StreamAnnouncer>,
    );

    rerender(
      <StreamAnnouncer text="The runway is " isStreaming>
        <p>body</p>
      </StreamAnnouncer>,
    );
    advance(STREAM_ANNOUNCE_INTERVAL_MS);
    expect(announcer().textContent).toBe('The runway is');

    rerender(
      <StreamAnnouncer text="The runway is eleven months long " isStreaming>
        <p>body</p>
      </StreamAnnouncer>,
    );
    advance(STREAM_ANNOUNCE_INTERVAL_MS);
    expect(announcer().textContent).toBe('eleven months long');
  });

  it('never reads half a word out', () => {
    const { rerender } = render(
      <StreamAnnouncer text="" isStreaming>
        <p>body</p>
      </StreamAnnouncer>,
    );

    rerender(
      <StreamAnnouncer text="antidisestablish" isStreaming>
        <p>body</p>
      </StreamAnnouncer>,
    );
    advance(STREAM_ANNOUNCE_INTERVAL_MS);
    expect(announcer().textContent).toBe('');

    rerender(
      <StreamAnnouncer text="antidisestablishmentarianism is long" isStreaming>
        <p>body</p>
      </StreamAnnouncer>,
    );
    advance(STREAM_ANNOUNCE_INTERVAL_MS);
    expect(announcer().textContent).toBe('antidisestablishmentarianism is');
  });

  it('reads the remainder once when the stream ends', () => {
    const { rerender } = render(
      <StreamAnnouncer text="The runway is " isStreaming>
        <p>body</p>
      </StreamAnnouncer>,
    );
    advance(STREAM_ANNOUNCE_INTERVAL_MS);

    rerender(
      <StreamAnnouncer text="The runway is eleven months." isStreaming={false}>
        <p>body</p>
      </StreamAnnouncer>,
    );

    expect(announcer().textContent).toBe('eleven months.');
  });

  it('says nothing at all for a message that was already finished when it mounted', () => {
    render(
      <StreamAnnouncer text="The runway is eleven months." isStreaming={false}>
        <p>body</p>
      </StreamAnnouncer>,
    );
    advance(STREAM_ANNOUNCE_INTERVAL_MS * 3);

    expect(announcer().textContent).toBe('');
  });

  it('stops ticking once the stream ends', () => {
    const { rerender } = render(
      <StreamAnnouncer text="one two " isStreaming>
        <p>body</p>
      </StreamAnnouncer>,
    );
    rerender(
      <StreamAnnouncer text="one two " isStreaming={false}>
        <p>body</p>
      </StreamAnnouncer>,
    );
    advance(STREAM_ANNOUNCE_INTERVAL_MS * 4);

    expect(announcer().textContent).toBe('one two');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('carries the polite live region beside the rendered body, not around it', () => {
    render(
      <StreamAnnouncer text="" isStreaming>
        <p data-testid="body">body</p>
      </StreamAnnouncer>,
    );

    const region = announcer();
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.className).toContain('sr-only');
    expect(region.contains(screen.getByTestId('body'))).toBe(false);
  });
});
