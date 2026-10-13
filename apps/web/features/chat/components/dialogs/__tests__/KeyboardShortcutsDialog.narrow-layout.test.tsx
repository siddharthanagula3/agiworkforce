import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOST_MENU_SHORTCUTS, type HostBridge } from '@agiworkforce/local-runtime-contract';

import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';
import { KEYBOARD_SHORTCUT_DOCS } from '../../../hooks/use-keyboard-shortcuts';
import { useSettingsStore } from '@shared/stores/web-settings-store';

const SUBTITLE = 'Speed up your workflow with these keyboard shortcuts';
const SINGLE_LINE_TEXT_CLASSES = ['whitespace-nowrap', 'truncate', 'text-nowrap'];

function classes(element: Element | null | undefined): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

function wrapsItsChildren(element: Element | null | undefined): boolean {
  const tokens = classes(element);
  return tokens.includes('flex') && tokens.includes('flex-wrap');
}

function installHost(bridge: Partial<HostBridge> | null) {
  if (bridge === null) {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'agiHost');
    return;
  }
  Object.defineProperty(window, 'agiHost', {
    value: {
      platform: 'electron-darwin',
      appVersion: '1.2.0',
      readPreferences: () => Promise.reject(new Error('no preferences in this test')),
      ...bridge,
    },
    configurable: true,
    writable: true,
  });
}

function renderDialog(onOpenChange: (open: boolean) => void = () => {}) {
  return render(
    <KeyboardShortcutsDialog open onOpenChange={onOpenChange} shortcuts={KEYBOARD_SHORTCUT_DOCS} />,
  );
}

beforeEach(() => {
  useSettingsStore.setState({ disabledShortcutIds: [] });
});

afterEach(() => {
  cleanup();
  installHost(null);
});

describe('KeyboardShortcutsDialog at a narrow width', () => {
  it('lets a row drop its keys and switch under the label instead of widening the dialog', () => {
    renderDialog();

    for (const doc of KEYBOARD_SHORTCUT_DOCS) {
      const toggle = screen.getByRole('switch', { name: doc.description });
      const row = screen.getByText(doc.description).parentElement;
      const controls = toggle.parentElement;
      const keys = toggle.previousElementSibling;

      expect(row?.contains(toggle), `${doc.id} label and switch share a row`).toBe(true);
      expect(wrapsItsChildren(row), `${doc.id} row wraps`).toBe(true);
      expect(classes(controls), `${doc.id} controls stay at the row end`).toContain('ms-auto');
      expect(wrapsItsChildren(keys), `${doc.id} key badges wrap`).toBe(true);
    }
  });

  it('keeps the subtitle as wrapping text that describes the dialog', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    const subtitle = screen.getByText(SUBTITLE);

    expect(dialog.getAttribute('aria-describedby')).toBe(subtitle.id);
    for (let node: Element | null = subtitle; node && node !== dialog; node = node.parentElement) {
      for (const token of SINGLE_LINE_TEXT_CLASSES) {
        expect(classes(node)).not.toContain(token);
      }
    }
  });

  it('wraps the desktop app rows the same way', async () => {
    installHost({});
    renderDialog();

    const heading = await screen.findByRole('heading', { name: 'Desktop app' });
    const section = within(heading.parentElement as HTMLElement);

    for (const shortcut of HOST_MENU_SHORTCUTS) {
      const label = section.getByText(shortcut.description);
      const row = label.parentElement;
      const chord = label.nextElementSibling;

      expect(wrapsItsChildren(row), `${shortcut.id} row wraps`).toBe(true);
      expect(classes(chord), `${shortcut.id} chord stays at the row end`).toContain('ms-auto');
    }
  });

  it('still switches a shortcut off, restores it, and closes from Escape and the close control', () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(screen.getByRole('switch', { name: 'Open search' }));
    expect(useSettingsStore.getState().disabledShortcutIds).toEqual(['open-search']);

    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(useSettingsStore.getState().disabledShortcutIds).toEqual([]);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    onOpenChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
