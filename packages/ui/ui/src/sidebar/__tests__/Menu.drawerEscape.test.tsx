import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { Menu, MenuItem, isMenuPanelOpen, keepOpenForMenuEscape } from '../Menu';

function renderMenu() {
  return render(
    <Menu trigger={({ toggle }) => <button onClick={toggle}>Open menu</button>}>
      {({ close }) => (
        <MenuItem onSelect={close} close={close}>
          Rename
        </MenuItem>
      )}
    </Menu>,
  );
}

/**
 * Escape under an open row menu used to tear the whole sidebar drawer down,
 * because Radix's dismissable layer listens on `document` in the capture phase
 * and mounts before this menu does — an ordering jsdom cannot reproduce, so
 * these cover the decision the drawer makes rather than the browser's dispatch.
 * The drawer behaviour itself is proved by the e2e drawer spec.
 */
describe('Menu escape signal for a hosting drawer', () => {
  it('reports no open panel before the menu is opened', () => {
    renderMenu();
    expect(isMenuPanelOpen()).toBe(false);
  });

  it('reports an open panel while a row menu is showing', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await screen.findByRole('menu');

    expect(isMenuPanelOpen()).toBe(true);
  });

  it('declines the drawer dismissal while a menu is open, and closes only the menu', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(trigger);
    await screen.findByRole('menu');

    const escape = { preventDefault: vi.fn() };
    keepOpenForMenuEscape(escape);
    expect(escape.preventDefault).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('lets the drawer take the next Escape once the menu has closed', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await screen.findByRole('menu');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    const escape = { preventDefault: vi.fn() };
    keepOpenForMenuEscape(escape);
    expect(escape.preventDefault).not.toHaveBeenCalled();
    expect(isMenuPanelOpen()).toBe(false);
  });
});
