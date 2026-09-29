import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  attachMenuKeyboard,
  createButton,
  createIconButton,
  createMenu,
  createSpinner,
  createTextField,
  createToggle,
  openDialog,
} from '../index';

function key(name: string, init: KeyboardEventInit = {}): void {
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }),
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('buttons', () => {
  it('builds a typed button that runs its handler', () => {
    const onClick = vi.fn();
    const button = createButton({ label: 'Save', onClick });
    button.click();
    expect(button.type).toBe('button');
    expect(button.textContent).toBe('Save');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('names an icon button and hides its icon from assistive technology', () => {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const button = createIconButton({ label: 'Copy', icon, pressed: false });
    expect(button.getAttribute('aria-label')).toBe('Copy');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('menu', () => {
  function setup(onSelect = vi.fn()) {
    const trigger = createButton({ label: 'More' });
    document.body.appendChild(trigger);
    trigger.focus();
    const menu = createMenu({
      trigger,
      label: 'Chat actions',
      items: () => [
        { label: 'Rename', onSelect },
        { label: 'Archive', onSelect: vi.fn(), disabled: true },
        { label: 'Delete', onSelect: vi.fn(), destructive: true },
      ],
    });
    return { trigger, menu, onSelect };
  }

  it('opens from its trigger onto the first item and reports its state', () => {
    const { trigger, menu } = setup();
    trigger.click();
    expect(menu.isOpen()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.panel.id);
    expect(document.activeElement?.textContent).toBe('Rename');
  });

  it('moves with the arrow keys, skips disabled items and wraps', () => {
    const { trigger } = setup();
    trigger.click();
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Delete');
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Rename');
    key('End');
    expect(document.activeElement?.textContent).toBe('Delete');
    key('Home');
    expect(document.activeElement?.textContent).toBe('Rename');
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const { trigger, menu } = setup();
    trigger.click();
    key('Escape');
    expect(menu.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('wins the arrow keys over a document listener registered first', () => {
    const competing = vi.fn();
    document.addEventListener('keydown', competing, true);
    const { trigger } = setup();
    trigger.click();
    key('ArrowDown');
    document.removeEventListener('keydown', competing, true);
    expect(document.activeElement?.textContent).toBe('Delete');
  });

  it('runs the chosen item and closes', () => {
    const { trigger, menu, onSelect } = setup();
    trigger.click();
    (document.activeElement as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(menu.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a click outside', () => {
    const { trigger, menu } = setup();
    trigger.click();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isOpen()).toBe(false);
  });

  it('detaches a hand-built panel keyboard contract', () => {
    const panel = document.createElement('div');
    panel.innerHTML = '<button role="menuitem">A</button><button role="menuitem">B</button>';
    document.body.appendChild(panel);
    const onClose = vi.fn();
    const detach = attachMenuKeyboard({ panel, onClose });
    expect(document.activeElement?.textContent).toBe('A');
    detach();
    key('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('dialog', () => {
  it('labels itself, traps Tab, closes on Escape and returns focus', () => {
    const opener = createButton({ label: 'Open' });
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const cancel = createButton({ label: 'Cancel' });
    const confirm = createButton({ label: 'Confirm' });
    const dialog = openDialog({
      title: 'Delete chat?',
      description: 'This cannot be undone.',
      actions: [cancel, confirm],
      onClose,
    });

    expect(dialog.element.getAttribute('aria-modal')).toBe('true');
    expect(
      document.getElementById(dialog.element.getAttribute('aria-labelledby')!)?.textContent,
    ).toBe('Delete chat?');
    expect(document.activeElement).toBe(cancel);
    confirm.focus();
    key('Tab');
    expect(document.activeElement).toBe(cancel);
    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    key('Escape');
    expect(onClose).toHaveBeenCalledOnce();
    expect(dialog.element.isConnected).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});

describe('overlay stack', () => {
  it('lets Escape in a menu inside a dialog close only the menu', () => {
    const trigger = createButton({ label: 'More' });
    const onClose = vi.fn();
    const dialog = openDialog({ title: 'Settings', body: trigger, onClose });
    const menu = createMenu({
      trigger,
      items: () => [{ label: 'Rename', onSelect: vi.fn() }],
    });
    trigger.click();
    expect(menu.isOpen()).toBe(true);

    key('Escape');
    expect(menu.isOpen()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.element.isConnected).toBe(true);
    expect(document.activeElement).toBe(trigger);

    key('Escape');
    expect(onClose).toHaveBeenCalledOnce();
    expect(dialog.element.isConnected).toBe(false);
  });

  it('lets Escape close only the topmost of stacked dialogs', () => {
    const closeLower = vi.fn();
    const closeUpper = vi.fn();
    const lower = openDialog({
      title: 'Lower',
      actions: [createButton({ label: 'A' })],
      onClose: closeLower,
    });
    const upper = openDialog({
      title: 'Upper',
      actions: [createButton({ label: 'B' })],
      onClose: closeUpper,
    });

    key('Escape');
    expect(closeUpper).toHaveBeenCalledOnce();
    expect(closeLower).not.toHaveBeenCalled();
    expect(upper.element.isConnected).toBe(false);
    expect(lower.element.isConnected).toBe(true);

    key('Escape');
    expect(closeLower).toHaveBeenCalledOnce();
    expect(lower.element.isConnected).toBe(false);
  });

  it('still traps Tab in the dialog after Tab closes a menu inside it', () => {
    const trigger = createButton({ label: 'More' });
    const done = createButton({ label: 'Done' });
    openDialog({ title: 'Settings', body: trigger, actions: [done] });
    const menu = createMenu({ trigger, items: () => [{ label: 'Rename', onSelect: vi.fn() }] });
    trigger.click();
    done.focus();

    key('Tab');
    expect(menu.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});

describe('fields', () => {
  it('toggles a switch and reports the new state', () => {
    const onChange = vi.fn();
    const toggle = createToggle({ label: 'Memory', checked: false, onChange });
    toggle.element.click();
    expect(toggle.element.getAttribute('role')).toBe('switch');
    expect(toggle.element.getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith(true);
    toggle.setDisabled(true);
    toggle.element.click();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('labels a text field and announces an error through its hint', () => {
    const field = createTextField({ label: 'Name', hint: 'Shown to your team' });
    document.body.appendChild(field.element);
    expect(field.input.labels?.[0]?.textContent).toBe('Name');
    field.setError('Enter a name.');
    const hint = document.getElementById(field.input.getAttribute('aria-describedby')!);
    expect(field.input.getAttribute('aria-invalid')).toBe('true');
    expect(hint?.getAttribute('role')).toBe('alert');
    expect(hint?.textContent).toBe('Enter a name.');
    field.setError(null);
    expect(hint?.textContent).toBe('Shown to your team');
  });
});

describe('spinner', () => {
  it('announces loading and stays still when reduced motion is asked for', () => {
    vi.mocked(window.matchMedia).mockReturnValueOnce({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    const spinner = createSpinner({ label: 'Loading chats' });
    expect(spinner.element.getAttribute('role')).toBe('status');
    expect(spinner.element.textContent).toBe('Loading chats');
    expect(spinner.element.dataset['reducedMotion']).toBe('true');
  });
});
