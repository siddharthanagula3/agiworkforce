import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { Sidebar, openSearchShortcutLabel } from '../Sidebar';

const ROOT_SELECTOR = 'nav[style*="width"]';

function renderSidebar() {
  return render(
    <Sidebar
      sessions={[]}
      mode="cloud"
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

describe('Sidebar root layout', () => {
  it('declares its own inset so a narrow container cannot push it off-canvas', () => {
    const { container } = renderSidebar();
    const root = container.querySelector(ROOT_SELECTOR);

    // The root is positioned only so its descendants can anchor to it. Without
    // an explicit inset a narrow container resolved its inline end to 100% and
    // moved the whole sidebar exactly one container-width to the left, which is
    // what left the mobile navigation drawer rendering as an empty panel.
    expect(root?.className).toContain('relative');
    expect(root?.className).toContain('inset-auto');
  });

  it('badges the Search row with the binding that actually opens it', () => {
    // Cmd/Ctrl+K is taken by the command palette in the capture phase, so a
    // badge naming it sent the reader to a different surface than the row they
    // pressed. Shift+Cmd/Ctrl+F is the binding the shortcut table now defines.
    renderSidebar();
    const search = screen.getByRole('button', { name: /^Search/ });
    expect(within(search).queryAllByText(/^(⌘|Ctrl|K)$/)).toHaveLength(0);
    expect(within(search).getAllByText(openSearchShortcutLabel())).toHaveLength(1);
  });

  it('transitions only its width, not every animatable property', () => {
    const { container } = renderSidebar();
    const root = container.querySelector(ROOT_SELECTOR);

    expect(root?.className).toContain('transition-[width]');
    expect(root?.className).not.toContain('transition-all');
  });
});
