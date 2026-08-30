import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { Menu, MenuItem } from '../Menu';

function renderMenu() {
  return render(
    <Menu trigger={({ toggle }) => <button onClick={toggle}>Open menu</button>}>
      {({ close }) => (
        <>
          <MenuItem onSelect={close}>First</MenuItem>
          <MenuItem onSelect={close}>Second</MenuItem>
          <MenuItem onSelect={close}>Third</MenuItem>
        </>
      )}
    </Menu>,
  );
}

/**
 * `role="menu"` promises the WAI-ARIA menu keyboard pattern. Without it a
 * keyboard user opens this menu and reaches nothing inside it.
 */
describe('Menu keyboard pattern', () => {
  it('moves focus into the menu on open', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await waitFor(() => expect(document.activeElement?.textContent).toBe('First'));
  });

  it('cycles with ArrowDown and ArrowUp, and jumps with Home/End', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('First'));

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Second');

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toBe('First');

    // Wraps rather than dead-ending at the edge.
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toBe('Third');

    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement?.textContent).toBe('First');

    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement?.textContent).toBe('Third');
  });

  it('returns focus to the trigger on Escape', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(trigger);
    await screen.findByRole('menu');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
