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

/**
 * Open it the way a pointer does. `userEvent.click` dispatches the pointer
 * sequence first, so the hover handler opens the panel and the click then
 * toggles it shut again; that is real behaviour, not a test artefact, and it
 * would make this assert the opposite of what it means to.
 */
function openPanel() {
  const { container } = render(<NavGroup group={GROUP} />);
  const trigger = screen.getByRole('button', { name: /Product/ });
  fireEvent.mouseEnter(container.firstElementChild as Element);
  return trigger;
}

/**
 * The panel opens on click as well as on hover, and a click-opened panel had no
 * close path except another click or moving the pointer away. Scrolling left it
 * floating over the content being scrolled past.
 */
describe('an open marketing nav panel', () => {
  it('closes when the page scrolls', () => {
    const trigger = openPanel();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.scroll(window);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('stops listening once it is closed, so a later scroll costs nothing', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    openPanel();

    fireEvent.scroll(window);

    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    remove.mockRestore();
  });

  it('still closes on Escape and returns focus to the trigger', async () => {
    const trigger = openPanel();
    // Escape is handled on the group, so the key has to arrive from inside it.
    trigger.focus();

    await userEvent.keyboard('{Escape}');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
