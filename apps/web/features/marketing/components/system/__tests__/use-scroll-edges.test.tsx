import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';

import { resolveScrollEdges, useScrollEdges } from '../use-scroll-edges';

const VIEWPORT_WIDTH = 320;
const CONTENT_WIDTH = 900;

function sizeViewport(viewport: HTMLElement, scrollLeft: number) {
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: VIEWPORT_WIDTH });
  Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: CONTENT_WIDTH });
  viewport.scrollLeft = scrollLeft;
}

function Probe() {
  const { ref, scrollable, atStart, atEnd } = useScrollEdges<HTMLDivElement>();
  return (
    <div
      data-testid="viewport"
      data-scrollable={scrollable || undefined}
      data-at-start={atStart || undefined}
      data-at-end={atEnd || undefined}
      ref={ref}
    >
      <table />
    </div>
  );
}

describe('resolveScrollEdges', () => {
  it('reports a table that fits as not scrollable and pinned to both edges', () => {
    expect(
      resolveScrollEdges({
        scrollLeft: 0,
        scrollWidth: VIEWPORT_WIDTH,
        clientWidth: VIEWPORT_WIDTH,
      }),
    ).toEqual({ scrollable: false, atStart: true, atEnd: true });
  });

  it('reports the start edge only before the reader scrolls', () => {
    expect(
      resolveScrollEdges({
        scrollLeft: 0,
        scrollWidth: CONTENT_WIDTH,
        clientWidth: VIEWPORT_WIDTH,
      }),
    ).toEqual({ scrollable: true, atStart: true, atEnd: false });
  });

  it('reports neither edge midway through the row', () => {
    expect(
      resolveScrollEdges({
        scrollLeft: (CONTENT_WIDTH - VIEWPORT_WIDTH) / 2,
        scrollWidth: CONTENT_WIDTH,
        clientWidth: VIEWPORT_WIDTH,
      }),
    ).toEqual({ scrollable: true, atStart: false, atEnd: false });
  });

  it('reports the end edge once the last cell is reached', () => {
    expect(
      resolveScrollEdges({
        scrollLeft: CONTENT_WIDTH - VIEWPORT_WIDTH,
        scrollWidth: CONTENT_WIDTH,
        clientWidth: VIEWPORT_WIDTH,
      }),
    ).toEqual({ scrollable: true, atStart: false, atEnd: true });
  });

  it('reads a right to left viewport by distance travelled', () => {
    expect(
      resolveScrollEdges({
        scrollLeft: -(CONTENT_WIDTH - VIEWPORT_WIDTH),
        scrollWidth: CONTENT_WIDTH,
        clientWidth: VIEWPORT_WIDTH,
      }),
    ).toEqual({ scrollable: true, atStart: false, atEnd: true });
  });
});

describe('useScrollEdges', () => {
  it('publishes the edge state as data attributes and updates them on scroll', () => {
    const { getByTestId } = render(<Probe />);
    const viewport = getByTestId('viewport');

    sizeViewport(viewport, 0);
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });

    expect(viewport.getAttribute('data-scrollable')).toBe('true');
    expect(viewport.getAttribute('data-at-start')).toBe('true');
    expect(viewport.getAttribute('data-at-end')).toBeNull();

    sizeViewport(viewport, CONTENT_WIDTH - VIEWPORT_WIDTH);
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });

    expect(viewport.getAttribute('data-at-start')).toBeNull();
    expect(viewport.getAttribute('data-at-end')).toBe('true');
  });

  it('stops listening once the table unmounts', () => {
    const { getByTestId, unmount } = render(<Probe />);
    const viewport = getByTestId('viewport');

    sizeViewport(viewport, 0);
    unmount();

    sizeViewport(viewport, CONTENT_WIDTH - VIEWPORT_WIDTH);
    expect(() => viewport.dispatchEvent(new Event('scroll'))).not.toThrow();
  });
});
