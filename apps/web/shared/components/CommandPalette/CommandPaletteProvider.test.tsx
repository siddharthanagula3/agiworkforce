import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CommandPaletteProvider } from './CommandPaletteProvider';

const paletteModule = vi.hoisted(() => ({ loads: 0 }));

vi.mock('./CommandPalette', () => {
  paletteModule.loads += 1;
  return {
    CommandPalette: ({ open }: { open: boolean }) => (
      <div data-testid="palette" data-open={open ? 'true' : 'false'} />
    ),
  };
});

const pressCmdK = () => fireEvent.keyDown(document, { key: 'k', metaKey: true });
const isOpen = (el: HTMLElement) => el.getAttribute('data-open') === 'true';

/**
 * The chat route used to be excluded here so it would not fight the chat
 * page's own Cmd/Ctrl+K binding (for `GlobalSearchDialog`). That handler
 * turned out not to reliably fire in practice, so Cmd+K did nothing on
 * /chat: the audit that flagged item 1 caught exactly this. This provider
 * now opens on every route and wins any conflict by listening in the
 * capture phase and calling stopPropagation, verified below against a
 * simulated bubble-phase listener since jsdom, unlike a real browser, has
 * no capture/bubble distinction a naive test would catch on its own.
 *
 * The palette module itself is loaded on the first shortcut, not on mount:
 * it carries the model catalogue and the app stores, which a legal page or
 * the sign-in form never needs.
 */
describe('CommandPaletteProvider global Cmd/Ctrl+K', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not mount or load the palette until the shortcut is used', () => {
    const loadsBefore = paletteModule.loads;
    const { queryByTestId } = render(<CommandPaletteProvider />);
    expect(queryByTestId('palette')).toBeNull();
    expect(paletteModule.loads).toBe(loadsBefore);
  });

  it('opens the palette on Cmd/Ctrl+K', async () => {
    const { findByTestId } = render(<CommandPaletteProvider />);
    pressCmdK();
    expect(isOpen(await findByTestId('palette'))).toBe(true);
  });

  it('opens on the chat route, where a bubble-phase listener used to own the shortcut', async () => {
    const { findByTestId } = render(<CommandPaletteProvider />);
    pressCmdK();
    expect(isOpen(await findByTestId('palette'))).toBe(true);
  });

  it('toggles closed on a second Cmd/Ctrl+K', async () => {
    const { findByTestId } = render(<CommandPaletteProvider />);
    pressCmdK();
    const palette = await findByTestId('palette');
    expect(isOpen(palette)).toBe(true);
    pressCmdK();
    expect(isOpen(await findByTestId('palette'))).toBe(false);
  });

  it('stops the event from reaching a bubble-phase document listener registered after it', () => {
    render(<CommandPaletteProvider />);
    const bubbleListener = vi.fn();
    document.addEventListener('keydown', bubbleListener);
    pressCmdK();
    document.removeEventListener('keydown', bubbleListener);
    expect(bubbleListener).not.toHaveBeenCalled();
  });

  it('leaves an unrelated keydown alone', () => {
    const { queryByTestId } = render(<CommandPaletteProvider />);
    fireEvent.keyDown(document, { key: 'j', metaKey: true });
    expect(queryByTestId('palette')).toBeNull();
  });
});
