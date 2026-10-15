import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: host.invoke,
  isTauri: true,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: host.toastError },
}));

import { describeProjectMemory, ProjectMemorySection } from '../ProjectMemorySection';
import { useProjectMemoryStore, type ProjectMemory } from '../../../stores/projectMemoryStore';

type TauriMockModule = typeof import('../../../lib/tauri-mock');

const FOLDER = '/Users/someone/code/app';

function memory(id: number, memoryType: string, content: unknown): ProjectMemory {
  return {
    id,
    project_folder: FOLDER,
    memory_type: memoryType,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    importance: 7,
    created_at: '2026-10-11 00:00:00',
    updated_at: '2026-10-11 00:00:00',
    last_accessed: null,
  };
}

const DECISION = memory(1, 'architecturaldecision', {
  id: 0,
  project_folder: FOLDER,
  decision: 'Use pnpm, never npm',
  rationale: 'The lockfile is pnpm-lock.yaml',
  status: 'accepted',
});

function respond(memories: ProjectMemory[]) {
  let stored = [...memories];
  host.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'get_project_memories') return stored;
    if (command === 'save_architectural_decision') {
      const request = args?.['request'] as { decision: string; rationale: string };
      stored = [
        ...stored,
        memory(stored.length + 10, 'architecturaldecision', {
          decision: request.decision,
          rationale: request.rationale,
        }),
      ];
      return stored.length + 9;
    }
    if (command === 'delete_project_memory') {
      stored = stored.filter((entry) => entry.id !== args?.['memoryId']);
      return true;
    }
    throw new Error(`unexpected command ${command}`);
  });
}

describe('ProjectMemorySection', () => {
  beforeEach(() => {
    useProjectMemoryStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists the memories stored for exactly this folder and says when they are used', async () => {
    respond([DECISION]);
    render(<ProjectMemorySection projectFolder={FOLDER} />);

    expect(await screen.findByText('Use pnpm, never npm')).toBeTruthy();
    expect(screen.getByText('The lockfile is pnpm-lock.yaml')).toBeTruthy();
    expect(screen.getByText('~/code/app')).toBeTruthy();
    expect(screen.getByText(/while memories are turned on in Settings → Memory/)).toBeTruthy();
    expect(host.invoke).toHaveBeenCalledWith('get_project_memories', { projectFolder: FOLDER });
  });

  it('says so when the folder has no memories', async () => {
    respond([]);
    render(<ProjectMemorySection projectFolder={FOLDER} />);

    expect(await screen.findByText('No memories for this folder yet.')).toBeTruthy();
  });

  it('adds a memory through the host command and shows it in the list', async () => {
    respond([]);
    render(<ProjectMemorySection projectFolder={FOLDER} />);
    await screen.findByText('No memories for this folder yet.');

    const add = screen.getByRole('button', { name: 'Add memory' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Remember for this folder'), {
      target: { value: '  Tests run with vitest  ' },
    });
    fireEvent.change(screen.getByLabelText('Reason (optional)'), {
      target: { value: 'Jest was removed' },
    });
    fireEvent.click(add);

    await waitFor(() =>
      expect(host.invoke).toHaveBeenCalledWith('save_architectural_decision', {
        request: {
          projectFolder: FOLDER,
          decision: 'Tests run with vitest',
          rationale: 'Jest was removed',
        },
      }),
    );
    expect(await screen.findByText('Tests run with vitest')).toBeTruthy();
    expect((screen.getByLabelText('Remember for this folder') as HTMLInputElement).value).toBe('');
  });

  it('keeps what was typed and reports the reason when saving fails', async () => {
    respond([]);
    render(<ProjectMemorySection projectFolder={FOLDER} />);
    await screen.findByText('No memories for this folder yet.');
    host.invoke.mockRejectedValueOnce(new Error('Memory cannot exceed 1000 characters'));

    fireEvent.change(screen.getByLabelText('Remember for this folder'), {
      target: { value: 'Keep me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add memory' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Memory cannot exceed 1000 characters');
    expect((screen.getByLabelText('Remember for this folder') as HTMLInputElement).value).toBe(
      'Keep me',
    );
  });

  it('asks before deleting, names the consequence, and does nothing on cancel', async () => {
    respond([DECISION]);
    render(<ProjectMemorySection projectFolder={FOLDER} />);
    await screen.findByText('Use pnpm, never npm');

    fireEvent.click(screen.getByRole('button', { name: 'Delete memory: Use pnpm, never npm' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Delete this folder memory?');
    expect(dialog.textContent).toContain('Chats in ~/code/app stop recalling it');
    expect(dialog.textContent).toContain('cannot be recovered');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(host.invoke).not.toHaveBeenCalledWith('delete_project_memory', expect.anything());
    expect(screen.getByText('Use pnpm, never npm')).toBeTruthy();
  });

  it('deletes the memory once confirmed', async () => {
    respond([DECISION]);
    render(<ProjectMemorySection projectFolder={FOLDER} />);
    await screen.findByText('Use pnpm, never npm');

    fireEvent.click(screen.getByRole('button', { name: 'Delete memory: Use pnpm, never npm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete memory' }));

    await waitFor(() =>
      expect(host.invoke).toHaveBeenCalledWith('delete_project_memory', { memoryId: 1 }),
    );
    await waitFor(() => expect(screen.queryByText('Use pnpm, never npm')).toBeNull());
  });

  it('reports a failed load and retries on request', async () => {
    host.invoke.mockRejectedValueOnce(new Error('database is locked'));
    render(<ProjectMemorySection projectFolder={FOLDER} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('database is locked');
    expect(screen.queryByText('No memories for this folder yet.')).toBeNull();

    respond([DECISION]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Use pnpm, never npm')).toBeTruthy();
  });
});

describe('describeProjectMemory', () => {
  it('reads every stored shape without showing raw JSON or the folder path', () => {
    expect(
      describeProjectMemory(
        memory(2, 'codingstyle', {
          project_folder: FOLDER,
          style_key: 'naming',
          style_value: 'snake_case',
          category: 'naming',
        }),
      ),
    ).toEqual({ title: 'naming', detail: 'snake_case' });
    expect(
      describeProjectMemory(
        memory(3, 'context', {
          project_folder: FOLDER,
          tech_stack: ['Rust', 'TypeScript'],
          main_language: 'Rust',
          conventions: 'Use typed errors',
          frameworks: ['Tauri'],
        }),
      ),
    ).toEqual({ title: 'Rust, TypeScript · Rust · Tauri', detail: 'Use typed errors' });
    expect(describeProjectMemory(memory(4, 'context', 'plain legacy text'))).toEqual({
      title: 'plain legacy text',
      detail: null,
    });
  });
});
