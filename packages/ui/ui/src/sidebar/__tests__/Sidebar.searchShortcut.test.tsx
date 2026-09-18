import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPEN_SEARCH_SHORTCUT, Sidebar, openSearchShortcutLabel } from '../Sidebar';

afterEach(() => {
  cleanup();
});

function renderSidebar() {
  return render(
    <Sidebar
      sessions={[]}
      mode="cloud"
      collapsed={false}
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onToggleCollapse={vi.fn()}
    />,
  );
}

// The row used to carry no badge because the binding it would have advertised,
// Cmd/Ctrl+K, is taken by the command palette in the capture phase.
describe('sidebar search row advertises the binding that opens it', () => {
  it('renders the shortcut beside the Search label', () => {
    renderSidebar();

    const search = screen.getByRole('button', { name: /search/i });
    expect(search.textContent).toContain(openSearchShortcutLabel());
  });

  it('never advertises a bare Cmd/Ctrl+K', () => {
    expect(openSearchShortcutLabel(true)).toBe('⇧⌘F');
    expect(openSearchShortcutLabel(false)).toBe('Shift+Ctrl+F');
    expect(OPEN_SEARCH_SHORTCUT.key).not.toBe('K');
    expect(OPEN_SEARCH_SHORTCUT.shift).toBe(true);
  });
});
