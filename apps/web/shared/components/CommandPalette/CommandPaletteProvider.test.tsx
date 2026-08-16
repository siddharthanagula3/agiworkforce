import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CommandPaletteProvider } from './CommandPaletteProvider';

const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

vi.mock('./CommandPalette', () => ({
  CommandPalette: ({ open }: { open: boolean }) => (
    <div data-testid="palette" data-open={open ? 'true' : 'false'} />
  ),
}));

const pressCmdK = () => fireEvent.keyDown(document, { key: 'k', metaKey: true });
const isOpen = (el: HTMLElement) => el.getAttribute('data-open') === 'true';

describe('CommandPaletteProvider ⌘K gating', () => {
  beforeEach(() => {
    nav.pathname = '/';
  });

  it('opens the palette on ⌘K on a non-chat route', () => {
    nav.pathname = '/pricing';
    const { getByTestId } = render(<CommandPaletteProvider />);
    expect(isOpen(getByTestId('palette'))).toBe(false);
    pressCmdK();
    expect(isOpen(getByTestId('palette'))).toBe(true);
  });

  it('does NOT open the palette on ⌘K on /chat (search owns the shortcut there)', () => {
    nav.pathname = '/chat';
    const { getByTestId } = render(<CommandPaletteProvider />);
    pressCmdK();
    expect(isOpen(getByTestId('palette'))).toBe(false);
  });

  it('does NOT open on a nested /chat/[id] conversation route', () => {
    nav.pathname = '/chat/abc-123';
    const { getByTestId } = render(<CommandPaletteProvider />);
    pressCmdK();
    expect(isOpen(getByTestId('palette'))).toBe(false);
  });

  it('DOES open on a /chat-prefixed route that is not the chat surface (gate is exact, not loose)', () => {
    nav.pathname = '/chat-settings';
    const { getByTestId } = render(<CommandPaletteProvider />);
    pressCmdK();
    expect(isOpen(getByTestId('palette'))).toBe(true);
  });
});
