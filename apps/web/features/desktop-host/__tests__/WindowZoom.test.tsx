import { render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useWindowZoom } from '../hooks/use-window-zoom';

const fakeHost = { platform: 'electron-darwin' } as unknown as HostBridge;

function setViewport(outer: number, inner: number) {
  Object.defineProperty(window, 'outerWidth', { value: outer, configurable: true, writable: true });
  Object.defineProperty(window, 'innerWidth', { value: inner, configurable: true, writable: true });
}

function Harness({ host }: { host: HostBridge | null }) {
  useWindowZoom(host);
  return null;
}

function zoom(): string {
  return document.documentElement.style.getPropertyValue('--agi-window-zoom');
}

afterEach(() => {
  document.documentElement.style.removeProperty('--agi-window-zoom');
  vi.restoreAllMocks();
});

describe('window zoom', () => {
  it('publishes the ratio of screen pixels to CSS pixels', () => {
    setViewport(1280, 1280);
    render(<Harness host={fakeHost} />);

    expect(zoom()).toBe('1');
  });

  // The reserved strip is CSS pixels and the window buttons over it are not, so
  // a zoomed-out window would slide its brand mark back under the close button.
  it('follows a zoom change', () => {
    setViewport(1280, 1280);
    render(<Harness host={fakeHost} />);

    setViewport(1280, 1066);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(Number(zoom())).toBeCloseTo(1.2, 2);

    setViewport(1280, 1536);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(Number(zoom())).toBeCloseTo(0.833, 2);
  });

  it('falls back to no scaling on a nonsense viewport', () => {
    setViewport(1280, 0);
    render(<Harness host={fakeHost} />);

    expect(zoom()).toBe('1');
  });

  it('publishes nothing in a browser, and clears it on unmount', () => {
    setViewport(1280, 1066);
    const { unmount } = render(<Harness host={null} />);
    expect(zoom()).toBe('');

    unmount();
    const view = render(<Harness host={fakeHost} />);
    expect(zoom()).not.toBe('');

    view.unmount();
    expect(zoom()).toBe('');
  });
});
