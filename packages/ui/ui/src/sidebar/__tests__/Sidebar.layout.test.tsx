import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Sidebar } from '../Sidebar';

describe('Sidebar root layout', () => {
  it('declares its own inset so a narrow container cannot push it off-canvas', () => {
    const { container } = render(<Sidebar sessions={[]} mode="cloud" />);
    const root = container.querySelector('div[style*="width"]');

    // The root is positioned only so its descendants can anchor to it. Without
    // an explicit inset a narrow container resolved its inline end to 100% and
    // moved the whole sidebar exactly one container-width to the left, which is
    // what left the mobile navigation drawer rendering as an empty panel.
    expect(root?.className).toContain('relative');
    expect(root?.className).toContain('inset-auto');
  });

  it('transitions only its width, not every animatable property', () => {
    const { container } = render(<Sidebar sessions={[]} mode="cloud" />);
    const root = container.querySelector('div[style*="width"]');

    expect(root?.className).toContain('transition-[width]');
    expect(root?.className).not.toContain('transition-all');
  });
});
