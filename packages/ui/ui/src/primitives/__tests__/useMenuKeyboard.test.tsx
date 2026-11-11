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

function ChoiceMenu() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useMenuKeyboard({ open: true, onClose: vi.fn(), panelRef });
  return (
    <div role="menu" ref={panelRef}>
      <button type="button" role="menuitemradio" aria-checked="true">
        Alpha
      </button>
      <button type="button" role="menuitemcheckbox" aria-checked="false">
        Beta
      </button>
      <button type="button" role="menuitem">
        Gamma
      </button>
    </div>
  );
}

describe('useMenuKeyboard', () => {
  it('navigates radio and checkbox menu items without an itemSelector override', () => {
    render(<ChoiceMenu />);
    const alpha = screen.getByRole('menuitemradio', { name: 'Alpha' });
    const beta = screen.getByRole('menuitemcheckbox', { name: 'Beta' });
    const gamma = screen.getByRole('menuitem', { name: 'Gamma' });
    expect(document.activeElement).toBe(alpha);

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(beta);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(gamma);
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(alpha);
  });

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
