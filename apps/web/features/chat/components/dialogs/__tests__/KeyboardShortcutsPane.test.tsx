import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useHostShortcuts: () => [],
}));

type BrowserUtilsModule = typeof import('@shared/utils/browser-utils');

vi.mock('@shared/utils/browser-utils', async (importOriginal) => {
  const actual = await importOriginal<BrowserUtilsModule>();
  return { ...actual, safePlatform: { ...actual.safePlatform, isMac: () => false } };
});

import { KeyboardShortcutsPane } from '../KeyboardShortcutsDialog';
import { KEYBOARD_SHORTCUT_DOCS, formatShortcutKeys } from '../../../hooks/use-keyboard-shortcuts';
import { useSettingsStore } from '@shared/stores/web-settings-store';

function renderPane() {
  return render(<KeyboardShortcutsPane shortcuts={KEYBOARD_SHORTCUT_DOCS} />);
}

function recorder(description: string) {
  return screen.getByRole('button', { name: new RegExp(`^Change keys for ${description}`) });
}

beforeEach(() => {
  useSettingsStore.setState({ disabledShortcutIds: [], shortcutBindings: {} });
});
afterEach(cleanup);

describe('KeyboardShortcutsPane', () => {
  it('shows the Keyboard heading, the instruction and the App and Composer groups', () => {
    renderPane();

    expect(screen.getByRole('heading', { level: 1, name: 'Keyboard' })).toBeInTheDocument();
    expect(screen.getByText(/To change a shortcut, select its keys/)).toBeInTheDocument();
    const app = screen.getByRole('region', { name: 'App' });
    const composer = screen.getByRole('region', { name: 'Composer' });
    expect(within(app).getByText('Copy last message')).toBeInTheDocument();
    expect(within(composer).getByText('Send message')).toBeInTheDocument();
    expect(within(composer).queryAllByRole('switch')).toHaveLength(0);
  });

  it('keeps Restore defaults in the footer, off while every shortcut is at its default', () => {
    renderPane();
    const restore = screen.getByRole('button', { name: 'Restore defaults' });
    expect(restore).toBeDisabled();

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle artifacts panel' }));
    expect(restore).toBeEnabled();
    fireEvent.click(restore);
    expect(useSettingsStore.getState().disabledShortcutIds).toEqual([]);
    expect(restore).toBeDisabled();
  });

  it('records a new combination when the keys are selected and a chord is pressed', () => {
    renderPane();
    const button = recorder('Copy last message');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(button, { key: 'Shift', shiftKey: true, ctrlKey: true });
    expect(useSettingsStore.getState().shortcutBindings).toEqual({});

    fireEvent.keyDown(button, { key: 'E', shiftKey: true, ctrlKey: true });

    expect(useSettingsStore.getState().shortcutBindings['copy-last-message']).toMatchObject({
      key: 'E',
      ctrl: true,
      shift: true,
    });
    expect(recorder('Copy last message')).toHaveAccessibleName(
      'Change keys for Copy last message, now Ctrl Shift E',
    );
  });

  it('forgets a recorded combination when the default keys are recorded again', () => {
    useSettingsStore.setState({
      shortcutBindings: { 'copy-last-message': { key: 'E', ctrl: true, meta: true, shift: true } },
    });
    renderPane();
    const button = recorder('Copy last message');

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'C', shiftKey: true, ctrlKey: true });

    expect(useSettingsStore.getState().shortcutBindings).toEqual({});
    expect(screen.getByRole('button', { name: 'Restore defaults' })).toBeDisabled();
  });

  it('refuses a combination another shortcut already uses and says which', () => {
    renderPane();
    const button = recorder('Copy last message');

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'R', shiftKey: true, ctrlKey: true });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ctrl Shift R is already used by Regenerate last message.',
    );
    expect(useSettingsStore.getState().shortcutBindings).toEqual({});
  });

  it('refuses a combination the browser keeps for itself', () => {
    renderPane();
    const button = recorder('Toggle artifacts panel');

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 't', ctrlKey: true });

    expect(screen.getByRole('alert')).toHaveTextContent('already used by the browser');
    expect(useSettingsStore.getState().shortcutBindings).toEqual({});
  });

  it('asks for Ctrl when a key is pressed alone, and Escape stops recording', () => {
    renderPane();
    const button = recorder('Focus message composer');

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'e' });
    expect(screen.getByRole('alert')).toHaveTextContent('Hold Ctrl');

    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(useSettingsStore.getState().shortcutBindings).toEqual({});
  });

  it('offers no recorder for shortcuts whose keys are printed elsewhere', () => {
    renderPane();
    for (const description of ['Open search', 'Show keyboard shortcuts', 'New conversation']) {
      expect(
        screen.queryByRole('button', { name: new RegExp(`Change keys for ${description}`) }),
      ).toBeNull();
    }
  });

  it('confirms before Restore defaults drops recorded keys, then resets keys and switches', async () => {
    useSettingsStore.setState({
      disabledShortcutIds: ['toggle-artifacts'],
      shortcutBindings: { 'copy-last-message': { key: 'E', ctrl: true, meta: true, shift: true } },
    });
    renderPane();

    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(useSettingsStore.getState().shortcutBindings).not.toEqual({});

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore defaults' }));

    await vi.waitFor(() => {
      expect(useSettingsStore.getState().shortcutBindings).toEqual({});
    });
    expect(useSettingsStore.getState().disabledShortcutIds).toEqual([]);
  });

  it('filters rows by description as the user types and hides empty groups', () => {
    renderPane();
    const search = screen.getByRole('searchbox', { name: 'Search shortcuts' });

    fireEvent.change(search, { target: { value: 'send message' } });
    expect(screen.getByText('Send message')).toBeInTheDocument();
    expect(screen.queryByText('Copy last message')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'App' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Composer' })).toBeInTheDocument();
  });

  it('filters rows by their keys, ignoring spaces and plus signs', () => {
    renderPane();
    const target = KEYBOARD_SHORTCUT_DOCS.find((doc) => doc.description === 'Copy last message');
    expect(target).toBeDefined();
    const keys = formatShortcutKeys(target!, false);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search shortcuts' }), {
      target: { value: keys.join(' + ') },
    });
    expect(screen.getByText('Copy last message')).toBeInTheDocument();
  });

  it('says so when nothing matches and restores the list when the query is cleared', () => {
    renderPane();
    const search = screen.getByRole('searchbox', { name: 'Search shortcuts' });

    fireEvent.change(search, { target: { value: 'zzzz-no-such-shortcut' } });
    expect(screen.getByRole('status')).toHaveTextContent('No shortcuts match');
    expect(screen.queryByRole('region', { name: 'App' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore defaults' })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'App' })).toBeInTheDocument();
  });

  it('pins the search field above sticky group labels', () => {
    renderPane();
    const bar = screen.getByRole('searchbox', { name: 'Search shortcuts' }).closest('.sticky');
    expect(bar).not.toBeNull();
    expect(bar).toHaveClass('top-0');
  });
});
