import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { undoLastChange } from '../undoLastChange';
import { RENDERER_SHORTCUTS } from '../../../constants/shortcuts';

const mockInvoke = vi.fn();

vi.mock('@/lib/tauri-mock', () => ({
  isTauri: false,
  isTauriContext: () => false,
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const invokedCommands = () => mockInvoke.mock.calls.map(([command]) => command);

describe('undoLastChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reverts through undo_last once undo_can_undo confirms there is history', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'undo_can_undo') return Promise.resolve(true);
      if (command === 'undo_last')
        return Promise.resolve({ success: true, change_id: 'c1', message: 'Reverted file.ts' });
      return Promise.reject(new Error(`Unexpected invoke: ${command}`));
    });

    await expect(undoLastChange()).resolves.toBe(true);
    expect(invokedCommands()).toEqual(['undo_can_undo', 'undo_last']);
  });

  it('never calls undo_last when undo_can_undo says there is nothing to revert', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'undo_can_undo') return Promise.resolve(false);
      return Promise.reject(new Error(`Unexpected invoke: ${command}`));
    });

    await expect(undoLastChange()).resolves.toBe(false);
    expect(invokedCommands()).toEqual(['undo_can_undo']);
  });

  it('reports a backend refusal instead of claiming the change was reverted', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'undo_can_undo') return Promise.resolve(true);
      if (command === 'undo_last')
        return Promise.resolve({ success: false, change_id: 'c1', message: 'File moved' });
      return Promise.reject(new Error(`Unexpected invoke: ${command}`));
    });

    await expect(undoLastChange()).resolves.toBe(false);
  });
});

describe('undo shortcut wiring', () => {
  const appSource = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');

  it('binds a renderer shortcut to the undo action', () => {
    const shortcut = RENDERER_SHORTCUTS.find((s) => s.action === 'edit.undoLast');
    expect(shortcut).toBeDefined();
    expect(shortcut?.key).toBe('z');
    expect(shortcut?.modifiers).toEqual({ meta: true, alt: true });
  });

  it('leaves the native text-editing undo combo alone', () => {
    const shortcut = RENDERER_SHORTCUTS.find((s) => s.action === 'edit.undoLast');
    expect(shortcut?.modifiers.alt).toBe(true);
  });

  it('dispatches that action to undoLastChange in the app keydown handler', () => {
    expect(appSource).toContain("import { undoLastChange } from './features/undo/undoLastChange'");
    expect(appSource).toContain("'edit.undoLast': () => void undoLastChange()");
  });
});
