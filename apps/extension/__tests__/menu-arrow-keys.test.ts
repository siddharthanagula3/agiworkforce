/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { wireMenuArrowKeys } from '../src/features/side-panel/menu';

function press(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('wireMenuArrowKeys', () => {
  let items: HTMLButtonElement[];

  beforeEach(() => {
    document.body.replaceChildren();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    items = ['One', 'Two', 'Three'].map((label) => {
      const item = document.createElement('button');
      item.setAttribute('role', 'menuitem');
      item.textContent = label;
      menu.appendChild(item);
      return item;
    });
    document.body.appendChild(menu);
    wireMenuArrowKeys(menu);
  });

  it('moves focus with the arrow keys and wraps at both ends', () => {
    items[0]!.focus();
    press(items[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    press(items[1]!, 'ArrowDown');
    press(items[2]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    press(items[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(items[2]);
  });

  it('jumps to the first and last item with Home and End', () => {
    items[1]!.focus();
    press(items[1]!, 'End');
    expect(document.activeElement).toBe(items[2]);
    press(items[2]!, 'Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('skips hidden items', () => {
    items[1]!.hidden = true;
    items[0]!.focus();
    press(items[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[2]);
  });
});
