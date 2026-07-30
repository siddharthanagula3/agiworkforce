import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setMemoryEnabled = vi.fn(async () => undefined);
const setAllowToolAssistedMemoryGeneration = vi.fn(async () => undefined);
const deleteMemory = vi.fn(async () => true);
const loadAll = vi.fn(async () => undefined);

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
};

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}));

vi.mock('../../../stores/memoryStore', () => ({
  useMemoryStore: (selector: (state: typeof memoryState) => unknown) => selector(memoryState),
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  MemoryEditor: () => <div>Native saved-memory editor</div>,
}));

import { MemoryTab } from '../tabs/Memory';

describe('GAP-009 authoritative memory controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
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

    fireEvent.click(screen.getByRole('button', { name: 'Reset memories' }));
    await waitFor(() => expect(deleteMemory).toHaveBeenCalledWith(1));
  });

  it('cuts both orphan memory panels instead of mounting localStorage-only controls', () => {
    expect(existsSync(resolve(__dirname, '..', '..', 'memory', 'MemoryPanel.tsx'))).toBe(false);
    expect(existsSync(resolve(__dirname, '..', '..', 'memory-panel', 'index.tsx'))).toBe(false);
  });
});
