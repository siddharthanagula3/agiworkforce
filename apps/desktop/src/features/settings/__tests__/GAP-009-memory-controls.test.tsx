import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setMemoryEnabled = vi.fn(async () => undefined);
const setAllowToolAssistedMemoryGeneration = vi.fn(async () => undefined);
const deleteMemory = vi.fn(async () => true);
const deleteAll = vi.fn<() => Promise<number | null>>(async () => 1);
const importBackup = vi.fn(async () => ({
  memories_imported: 2,
  memories_skipped: 1,
  memories_replaced: 0,
  logs_imported: 0,
  errors: [],
}));
const loadAll = vi.fn(async () => undefined);
const exportBackup = vi.fn(async () => ({ version: '1', memories: [] }));
const exportMarkdown = vi.fn(async () => '# Memories\n\n- Uses VS Code\n');

const settingsState = {
  chatPreferences: {
    memoryEnabled: false,
    allowToolAssistedMemoryGeneration: false,
  },
  setMemoryEnabled,
  setAllowToolAssistedMemoryGeneration,
};

const memoryState = {
  memories: [
    {
      id: 1,
      category: 'fact' as const,
      topic: 'preferred_editor',
      content: 'Uses VS Code',
      importance: 7,
      source: 'manual',
      created_at: '2026-07-30T00:00:00.000Z',
      updated_at: '2026-07-30T00:00:00.000Z',
    },
  ],
  isLoading: false,
  error: null,
  loadAll,
  storeMemory: vi.fn(async () => 2),
  deleteMemory,
  deleteAll,
  importBackup,
  exportBackup,
  exportMarkdown,
};

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}));

vi.mock('../../../stores/memoryStore', () => ({
  useMemoryStore: Object.assign(
    (selector: (state: typeof memoryState) => unknown) => selector(memoryState),
    { getState: () => memoryState },
  ),
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  MemoryEditor: () => <div>Native saved-memory editor</div>,
}));

import { MemoryTab } from '../tabs/Memory';

describe('GAP-009 authoritative memory controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts the master, tool-assisted scope, reset, and native memory editor', async () => {
    render(<MemoryTab />);

    expect(screen.getByRole('heading', { name: 'Memory' })).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Enable memories' })).not.toBeChecked();
    expect(
      screen.getByRole('switch', {
        name: 'Allow memory generation from tool-assisted chats',
      }),
    ).toBeDisabled();
    expect(screen.getByText('Native saved-memory editor')).toBeVisible();

    fireEvent.click(screen.getByRole('switch', { name: 'Enable memories' }));
    await waitFor(() => expect(setMemoryEnabled).toHaveBeenCalledWith(true));
  });

  it('asks before deleting every memory, names the consequence, and deletes in one call', async () => {
    const nativeConfirm = vi.spyOn(globalThis, 'confirm');
    render(<MemoryTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset memories' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete all 1 memory?');
    expect(dialog).toHaveTextContent('cannot be recovered');
    expect(dialog).toHaveTextContent('Your system asks you once more before anything is deleted');
    expect(deleteAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete all memories' }));
    await waitFor(() => expect(deleteAll).toHaveBeenCalledTimes(1));
    expect(deleteMemory).not.toHaveBeenCalled();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText('Nothing was deleted.')).not.toBeInTheDocument();
  });

  it('says nothing was deleted when the system prompt is declined', async () => {
    deleteAll.mockResolvedValueOnce(null);
    render(<MemoryTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset memories' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Delete all memories' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Nothing was deleted.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('imports a JSON export and reports what was kept', async () => {
    const { container } = render(<MemoryTab />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{"memories":[]}'], 'memories.json', { type: 'application/json' });
    // jsdom 20 implements File without Blob.text(), which Chromium provides.
    Object.defineProperty(file, 'text', { value: async () => '{"memories":[]}' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(importBackup).toHaveBeenCalledWith('{"memories":[]}'));
    expect(
      await screen.findByText(
        'Imported 2 memories. 1 already saved on this device was kept unchanged.',
      ),
    ).toBeVisible();
  });

  it('downloads the Markdown export as a readable file and the JSON export as a backup', async () => {
    const downloads: Array<{ name: string; blob: Blob }> = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      downloads.push({ name: '', blob });
      return 'blob:memories';
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads[downloads.length - 1]!.name = this.download;
    });
    render(<MemoryTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Export Markdown' }));
    await waitFor(() => expect(exportMarkdown).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.name).toMatch(/^agi-memories-\d{4}-\d{2}-\d{2}\.md$/);
    expect(downloads[0]!.blob.type).toBe('text/markdown');
    expect(exportBackup).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Export JSON' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    await waitFor(() => expect(downloads).toHaveLength(2));
    expect(downloads[1]!.name).toMatch(/\.json$/);
    expect(downloads[1]!.blob.type).toBe('application/json');
  });

  it('cuts both orphan memory panels instead of mounting localStorage-only controls', () => {
    expect(existsSync(resolve(__dirname, '..', '..', 'memory', 'MemoryPanel.tsx'))).toBe(false);
    expect(existsSync(resolve(__dirname, '..', '..', 'memory-panel', 'index.tsx'))).toBe(false);
  });
});
