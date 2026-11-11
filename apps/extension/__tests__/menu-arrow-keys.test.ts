/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { wireMenuArrowKeys, wirePopupMenu } from '../src/features/side-panel/menu';

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

describe('wirePopupMenu', () => {
  let trigger: HTMLButtonElement;
  let menu: HTMLDivElement;
  let items: HTMLButtonElement[];
  let group: HTMLDivElement;

  beforeEach(() => {
    document.body.replaceChildren();
    trigger = document.createElement('button');
    menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    group = document.createElement('div');
    items = ['Settings', 'Shortcuts', 'Help', 'Logout'].map((label) => {
      const item = document.createElement('button');
      item.setAttribute('role', 'menuitem');
      item.textContent = label;
      return item;
    });
    menu.append(items[0]!, items[1]!, items[2]!, group);
    group.appendChild(items[3]!);
    document.body.append(trigger, menu);
  });

  it('wraps over the visible items when a trailing item is hidden', () => {
    items[3]!.hidden = true;
    wirePopupMenu(trigger, menu).open();
    expect(document.activeElement).toBe(items[0]);
    press(items[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    press(items[2]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    press(items[0]!, 'End');
    expect(document.activeElement).toBe(items[2]);
  });

  it('ignores items inside a hidden group', () => {
    group.hidden = true;
    wirePopupMenu(trigger, menu).open();
    items[2]!.focus();
    press(items[2]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    press(items[0]!, 'End');
    expect(document.activeElement).toBe(items[2]);
  });

  it('focuses the last visible item when opened with ArrowUp on the trigger', () => {
    items[3]!.hidden = true;
    wirePopupMenu(trigger, menu);
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(items[2]);
  });

  it('includes a previously hidden item once it is shown again', () => {
    items[3]!.hidden = true;
    wirePopupMenu(trigger, menu).open();
    items[3]!.hidden = false;
    press(items[0]!, 'End');
    expect(document.activeElement).toBe(items[3]);
  });
});
