import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Menu, MenuItem } from '../Menu';

function renderMenu(triggerRect: Partial<DOMRect>, panelHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.getAttribute('role') === 'menu') return new DOMRect(0, 0, 208, panelHeight);
    return { ...new DOMRect(0, 0, 24, 24), ...triggerRect } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'menu' ? panelHeight : 24;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'menu' ? 208 : 24;
  });

  render(
    <Menu align="end" trigger={({ toggle }) => <button onClick={toggle}>Open</button>}>
      {({ close }) => (
        <MenuItem close={close} onSelect={() => {}}>
          Pin
        </MenuItem>
      )}
    </Menu>,
  );
  fireEvent.click(screen.getByText('Open'));
  return screen.getByRole('menu');
}

describe('Menu placement', () => {
  beforeEach(() => {
    window.innerHeight = 800;
    window.innerWidth = 1200;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens below a trigger that has room beneath it', () => {
    const menu = renderMenu({ top: 100, bottom: 124, left: 40, right: 64 }, 200);
    expect(menu.style.top).toBe('128px');
    expect(menu.style.bottom).toBe('');
  });

  it('flips above a trigger near the bottom of the viewport', () => {
    const menu = renderMenu({ top: 740, bottom: 764, left: 40, right: 64 }, 200);
    expect(menu.style.top).toBe('');
    expect(menu.style.bottom).toBe(`${800 - 740 + 4}px`);
  });

  it('caps the height to the space available so every item stays reachable', () => {
    const menu = renderMenu({ top: 300, bottom: 324, left: 40, right: 64 }, 900);
    expect(menu.style.maxHeight).not.toBe('');
    expect(parseInt(menu.style.maxHeight, 10)).toBeLessThanOrEqual(800);
  });

  it('keeps an end-aligned menu inside the left edge', () => {
    const menu = renderMenu({ top: 100, bottom: 124, left: 10, right: 34 }, 200);
    expect(parseInt(menu.style.left, 10)).toBeGreaterThanOrEqual(8);
  });
});
