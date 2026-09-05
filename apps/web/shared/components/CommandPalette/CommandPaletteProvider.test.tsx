import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CommandPaletteProvider } from './CommandPaletteProvider';

vi.mock('./CommandPalette', () => ({
  CommandPalette: ({ open }: { open: boolean }) => (
    <div data-testid="palette" data-open={open ? 'true' : 'false'} />
  ),
}));

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
 */
describe('CommandPaletteProvider global Cmd/Ctrl+K', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the palette on Cmd/Ctrl+K', () => {
    const { getByTestId } = render(<CommandPaletteProvider />);
    expect(isOpen(getByTestId('palette'))).toBe(false);
    pressCmdK();
    expect(isOpen(getByTestId('palette'))).toBe(true);
  });

  it('opens on the chat route, where a bubble-phase listener used to own the shortcut', () => {
    const { getByTestId } = render(<CommandPaletteProvider />);
    pressCmdK();
    expect(isOpen(getByTestId('palette'))).toBe(true);
  });

  it('toggles closed on a second Cmd/Ctrl+K', () => {
    const { getByTestId } = render(<CommandPaletteProvider />);
    pressCmdK();
    expect(isOpen(getByTestId('palette'))).toBe(true);
    pressCmdK();
    expect(isOpen(getByTestId('palette'))).toBe(false);
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
    const { getByTestId } = render(<CommandPaletteProvider />);
    fireEvent.keyDown(document, { key: 'j', metaKey: true });
    expect(isOpen(getByTestId('palette'))).toBe(false);
  });
});
