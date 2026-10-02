import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { useMenuKeyboard } from '../useMenuKeyboard';

function Menu({ disabledItemsFocusable }: { disabledItemsFocusable?: boolean }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useMenuKeyboard({
    open: true,
    onClose: vi.fn(),
    panelRef,
    triggerRef,
    ...(disabledItemsFocusable === undefined ? {} : { disabledItemsFocusable }),
  });
  return (
    <div>
      <button type="button" ref={triggerRef}>
        Trigger
      </button>
      <div role="menu" ref={panelRef}>
        <button type="button" role="menuitem">
          First
        </button>
        <button type="button" role="menuitem" aria-disabled="true">
          Unavailable
        </button>
        <button type="button" role="menuitem" disabled>
          Off
        </button>
        <button type="button" role="menuitem">
          Last
        </button>
      </div>
    </div>
  );
}

describe('useMenuKeyboard', () => {
  it('skips items marked unavailable by default', () => {
    render(<Menu />);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First' }));

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Last' }));
  });

  it('lets arrows reach an aria-disabled item when the menu explains it on activation', () => {
    render(<Menu disabledItemsFocusable />);

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Unavailable' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Last' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Unavailable' }));
  });
});
