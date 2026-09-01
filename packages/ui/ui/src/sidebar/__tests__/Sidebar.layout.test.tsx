import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { Sidebar } from '../Sidebar';

const ROOT_SELECTOR = 'div[style*="width"]';

function renderSidebar() {
  return render(
    <Sidebar
      sessions={[]}
      mode="cloud"
      onNewChat={vi.fn()}
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

  it('transitions only its width, not every animatable property', () => {
    const { container } = renderSidebar();
    const root = container.querySelector(ROOT_SELECTOR);

    expect(root?.className).toContain('transition-[width]');
    expect(root?.className).not.toContain('transition-all');
  });
});
