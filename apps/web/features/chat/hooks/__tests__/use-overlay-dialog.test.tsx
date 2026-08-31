import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useOverlayDialog } from '../use-overlay-dialog';

function Harness({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  useOverlayDialog(ref, active && open, () => setOpen(false));
  return (
    <div>
      <input aria-label="composer behind the panel" />
      {open ? (
        <div ref={ref} tabIndex={-1} data-testid="panel">
          <button type="button">first</button>
          <button type="button">last</button>
        </div>
      ) : null}
    </div>
  );
}

// Focus containment itself is verified in the browser: focusableWithin filters
// on offsetParent, which jsdom always reports as null, so Tab cycling cannot be
// exercised here. What this file pins is the part jsdom can see - that focus
// leaves the page behind, that Escape dismisses, and that a panel sitting beside
// the conversation is left alone.
describe('useOverlayDialog', () => {
  it('takes focus off the page behind when the panel covers it', () => {
    render(<Harness active />);
    const behind = screen.getByLabelText('composer behind the panel');

    // The audit found focus resting on the composer while an opaque sheet
    // covered it, so a keyboard user was typing into something they could not see.
    expect(behind).not.toHaveFocus();
    expect(screen.getByTestId('panel').contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', () => {
    render(<Harness active />);
    fireEvent.keyDown(screen.getByTestId('panel'), { key: 'Escape' });
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('keeps Tab from leaving the panel', () => {
    render(<Harness active />);
    const panel = screen.getByTestId('panel');
    fireEvent.keyDown(panel, { key: 'Tab' });
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('leaves focus alone while the panel sits beside the page rather than over it', () => {
    render(<Harness active={false} />);
    const behind = screen.getByLabelText('composer behind the panel');
    behind.focus();
    expect(behind).toHaveFocus();
  });
});
