import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { NavGroup } from '../NavGroup';

const GROUP = {
  label: 'Product',
  items: [
    { href: '/chat', label: 'Chat', description: 'Talk to any model' },
    { href: '/code', label: 'Code', description: 'Run code in a sandbox' },
  ],
} as const;

function openPanelByHover() {
  const { container } = render(<NavGroup group={GROUP} />);
  const trigger = screen.getByRole('button', { name: /Product/ });
  fireEvent.mouseEnter(container.firstElementChild as Element);
  return trigger;
}

describe('an open marketing nav panel', () => {
  it('closes when the page scrolls', () => {
    const trigger = openPanelByHover();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.scroll(window);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('stops listening once it is closed, so a later scroll costs nothing', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    openPanelByHover();

    fireEvent.scroll(window);

    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    remove.mockRestore();
  });

  it('still closes on Escape and returns focus to the trigger', async () => {
    const trigger = openPanelByHover();
    // Escape is handled on the group, so the key has to arrive from inside it.
    trigger.focus();

    await userEvent.keyboard('{Escape}');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
