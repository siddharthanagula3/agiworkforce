import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useTablistKeyboard } from '../useTablistKeyboard';

const LABELS = ['One', 'Two', 'Three'];

function Tabs() {
  const [active, setActive] = useState(0);
  const { onKeyDown, tabIndexFor } = useTablistKeyboard({
    count: LABELS.length,
    active,
    onSelect: setActive,
    tabId: (index) => `tab-${index}`,
  });
  return (
    <div role="tablist" aria-label="Demo" onKeyDown={onKeyDown}>
      {LABELS.map((label, index) => (
        <button
          key={label}
          id={`tab-${index}`}
          type="button"
          role="tab"
          aria-selected={index === active}
          tabIndex={tabIndexFor(index)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function press(key: string) {
  fireEvent.keyDown(screen.getByRole('tablist'), { key });
}

describe('useTablistKeyboard', () => {
  it('only the active tab is in the tab order', () => {
    render(<Tabs />);
    expect(screen.getByRole('tab', { name: 'One' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Two' }).getAttribute('tabindex')).toBe('-1');
  });

  it('moves to the next tab and focuses it', () => {
    render(<Tabs />);
    press('ArrowRight');
    const two = screen.getByRole('tab', { name: 'Two' });
    expect(two.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(two);
  });

  it('ArrowDown behaves as next and ArrowUp as previous', () => {
    render(<Tabs />);
    press('ArrowDown');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Two' }));
    press('ArrowUp');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'One' }));
  });

  it('wraps from the last tab to the first and back', () => {
    render(<Tabs />);
    press('ArrowLeft');
    expect(screen.getByRole('tab', { name: 'Three' }).getAttribute('aria-selected')).toBe('true');
    press('ArrowRight');
    expect(screen.getByRole('tab', { name: 'One' }).getAttribute('aria-selected')).toBe('true');
  });

  it('Home and End jump to the ends', () => {
    render(<Tabs />);
    press('End');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Three' }));
    press('Home');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'One' }));
  });

  it('ignores other keys and leaves them unprevented', () => {
    render(<Tabs />);
    const notPrevented = fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });
    expect(notPrevented).toBe(true);
    expect(screen.getByRole('tab', { name: 'One' }).getAttribute('aria-selected')).toBe('true');
  });
});
