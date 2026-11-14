import { useRef } from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWindowEdgeOffset, WINDOW_EDGE_OFFSET_PROPERTY } from './use-window-edge-offset';

function Header() {
  const ref = useRef<HTMLElement>(null);
  useWindowEdgeOffset(ref);
  return <header ref={ref} data-testid="header" />;
}

afterEach(() => {
  document.documentElement.removeAttribute('data-desktop-host');
  vi.restoreAllMocks();
});

describe('useWindowEdgeOffset', () => {
  it('publishes where the header starts inside the desktop shell', () => {
    document.documentElement.setAttribute('data-desktop-host', 'electron-darwin');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 52,
    } as DOMRect);

    const { getByTestId } = render(<Header />);

    expect(getByTestId('header').style.getPropertyValue(WINDOW_EDGE_OFFSET_PROPERTY)).toBe('52px');
  });

  it('leaves a header in a browser alone', () => {
    const { getByTestId } = render(<Header />);
    expect(getByTestId('header').style.getPropertyValue(WINDOW_EDGE_OFFSET_PROPERTY)).toBe('');
  });
});
