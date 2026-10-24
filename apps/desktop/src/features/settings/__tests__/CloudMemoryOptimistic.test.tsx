import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The cloud memory adapter used to wait for the server before the list changed,
 * while the local adapter in the same screen applied changes synchronously. The
 * point of these is twofold: the list must change before the request settles,
 * and a failed write must put the list back with a reason attached.
 *
 * Deleting a memory is irreversible, so it asks first. The optimistic window
 * these measure opens when the confirmation is accepted, not when the row's
 * delete button is pressed.
 */

const listCloudMemories = vi.fn();
const createCloudMemory = vi.fn();
const updateCloudMemory = vi.fn();
const deleteCloudMemory = vi.fn();

vi.mock('../../../api/cloudMemory', () => ({
  listCloudMemories: (...args: unknown[]) => listCloudMemories(...args),
  createCloudMemory: (...args: unknown[]) => createCloudMemory(...args),
  updateCloudMemory: (...args: unknown[]) => updateCloudMemory(...args),
  deleteCloudMemory: (...args: unknown[]) => deleteCloudMemory(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fact = (id: string, text: string) => ({
  id,
  text,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  listCloudMemories.mockResolvedValue([fact('m1', 'likes espresso')]);
});

afterEach(() => cleanup());

// Deferred promises plus a full settings-tab render; the default 5s is not
// enough when the whole desktop suite is competing for the same cores.
vi.setConfig({ testTimeout: 30_000 });

async function renderCloudMemory(firstText = 'likes espresso') {
  const { MemoryTab } = await import('../tabs/Memory');
  render(<MemoryTab scope="cloud" />);
  await screen.findByText(firstText);
}

type User = ReturnType<typeof userEvent.setup>;

const deleteConfirmation = () =>
  screen.findByRole('alertdialog', { name: /delete this memory\?/i });

async function acceptDeleteConfirmation(user: User) {
  const dialog = await deleteConfirmation();
  await user.click(within(dialog).getByRole('button', { name: /^delete memory$/i }));
}

describe('cloud memory add', () => {
  it('shows the new fact before the server responds', async () => {
    const pending = deferred<ReturnType<typeof fact>>();
    createCloudMemory.mockReturnValue(pending.promise);
    const user = userEvent.setup({ delay: null });
    await renderCloudMemory();

    await user.type(screen.getByRole('textbox', { name: /add a new fact/i }), 'drinks oat milk');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    // Still in flight, and already on screen.
    expect(screen.getByText('drinks oat milk')).toBeTruthy();
    expect(screen.getByText('Saving…')).toBeTruthy();

    pending.resolve(fact('m2', 'drinks oat milk'));
    await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
    expect(screen.getByText('drinks oat milk')).toBeTruthy();
  });

  it('removes the fact again and says why when the server refuses', async () => {
    createCloudMemory.mockRejectedValue(new Error('quota reached'));
    const user = userEvent.setup({ delay: null });
    await renderCloudMemory();

    await user.type(screen.getByRole('textbox', { name: /add a new fact/i }), 'drinks oat milk');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('removed again');
    expect(alert.textContent).toContain('quota reached');

    // The row is gone from the list...
    expect(screen.queryByRole('button', { name: /edit memory: drinks oat milk/i })).toBeNull();
    // ...and the text is back in the composer so the user can retry without
    // retyping it.
    expect(screen.getByRole('textbox', { name: /add a new fact/i })).toHaveValue('drinks oat milk');
    // The untouched fact is undisturbed.
    expect(screen.getByText('likes espresso')).toBeTruthy();
  });
});

describe('cloud memory delete', () => {
  it('deletes nothing until the confirmation is accepted', async () => {
    const user = userEvent.setup({ delay: null });
    await renderCloudMemory();

    await user.click(screen.getByRole('button', { name: /delete memory fact/i }));
    expect(deleteCloudMemory).not.toHaveBeenCalled();

    const dialog = await deleteConfirmation();
    expect(dialog.textContent).toContain('cannot be restored');

    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    expect(deleteCloudMemory).not.toHaveBeenCalled();
    expect(screen.getByText('likes espresso')).toBeTruthy();
  });

  it('removes the row before the server responds', async () => {
    const pending = deferred<void>();
    deleteCloudMemory.mockReturnValue(pending.promise);
    const user = userEvent.setup({ delay: null });
    await renderCloudMemory();

    await user.click(screen.getByRole('button', { name: /delete memory fact/i }));
    await acceptDeleteConfirmation(user);

    expect(screen.queryByText('likes espresso')).toBeNull();
    pending.resolve();
    await waitFor(() => expect(screen.queryByText('likes espresso')).toBeNull());
  });

  it('puts the row back at its original position when the delete fails', async () => {
    listCloudMemories.mockResolvedValue([
      fact('m1', 'first'),
      fact('m2', 'second'),
      fact('m3', 'third'),
    ]);
    deleteCloudMemory.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup({ delay: null });

    await renderCloudMemory('second');

    const deletes = screen.getAllByRole('button', { name: /delete memory fact/i });
    await user.click(deletes[1]!);
    await acceptDeleteConfirmation(user);

    await screen.findByRole('alert');
    const texts = screen
      .getAllByRole('button', { name: /^Edit memory:/i })
      .map((node) => node.textContent);
    expect(texts).toEqual(['first', 'second', 'third']);
  });
});

describe('cloud memory edit', () => {
  it('restores the earlier text when the edit fails', async () => {
    updateCloudMemory.mockRejectedValue(new Error('conflict'));
    const user = userEvent.setup({ delay: null });
    await renderCloudMemory();

    await user.click(screen.getByRole('button', { name: /edit memory: likes espresso/i }));
    const editor = screen.getByRole('textbox', { name: /editing memory: likes espresso/i });
    await user.clear(editor);
    await user.type(editor, 'likes decaf');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('earlier text is back');
    await waitFor(() => expect(screen.getByText('likes espresso')).toBeTruthy());
    expect(screen.queryByText('likes decaf')).toBeNull();
  });
});
