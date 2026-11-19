import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryEditor, type MemoryEditorDataAdapter } from '../MemoryEditor';

function adapter(add: MemoryEditorDataAdapter['add']): MemoryEditorDataAdapter {
  return {
    scope: 'cloud',
    facts: [],
    syncStatus: 'synced',
    hydrateFromServer: vi.fn(async () => undefined),
    add,
    update: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  };
}

describe('MemoryEditor errors', () => {
  it('keeps internal mutation details out of the alert and restores the draft', async () => {
    const add = vi.fn(async () => {
      throw new Error('HTTP 500: SELECT secret FROM memory_facts');
    });
    render(<MemoryEditor adapter={adapter(add)} />);

    const input = screen.getByLabelText('Add a new fact') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Prefers concise answers' } });
    fireEvent.submit(input.closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Something went wrong on our side');
    expect(alert.textContent).not.toContain('HTTP 500');
    expect(alert.textContent).not.toContain('SELECT secret');
    expect(input.value).toBe('Prefers concise answers');
  });
});

describe('cloud draft preservation source fixtures (unexecuted)', () => {
  it.each(['acknowledged', 'rejected'] as const)(
    'keeps newer typing when an older add is %s',
    async (outcome) => {
      let resolve!: (value: unknown) => void;
      let reject!: (reason: unknown) => void;
      const add = vi.fn(
        () =>
          new Promise<unknown>((accept, fail) => {
            resolve = accept;
            reject = fail;
          }),
      );
      render(<MemoryEditor adapter={adapter(add)} />);
      const input = screen.getByLabelText('Add a new fact') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'Submitted fact' } });
      fireEvent.submit(input.closest('form')!);
      expect(input.value).toBe('Submitted fact');
      fireEvent.change(input, { target: { value: 'Newer unsaved typing' } });
      fireEvent.submit(input.closest('form')!);
      expect(add).toHaveBeenCalledTimes(1);
      await act(async () => {
        if (outcome === 'acknowledged') resolve({});
        else reject(new Error('The change was rejected'));
      });
      expect(input.value).toBe('Newer unsaved typing');
      if (outcome === 'rejected') expect(screen.getByRole('alert')).toBeDefined();
    },
  );
});

describe('MemoryEditor storage label', () => {
  it('tells a device-only memory store that nothing leaves this device', () => {
    render(
      <MemoryEditor adapter={{ ...adapter(vi.fn()), scope: 'local', syncStatus: 'unavailable' }} />,
    );

    expect(screen.getByText('Saved on this device only.')).toBeDefined();
    expect(screen.queryByText(/Synced to your account/)).toBeNull();
  });
});

describe('MemoryEditor edit save', () => {
  const fact = {
    id: 'memory-1',
    text: 'Prefers concise answers',
    source: 'user',
    createdAt: '2026-11-07T00:00:00Z',
    updatedAt: '2026-11-07T00:00:00Z',
  };

  function editAdapter(
    scope: 'local' | 'cloud',
    update: MemoryEditorDataAdapter['update'],
  ): MemoryEditorDataAdapter {
    return {
      ...adapter(vi.fn()),
      scope,
      facts: [fact],
      syncStatus: scope === 'cloud' ? 'synced' : 'unavailable',
      update,
    };
  }

  it.each(['local', 'cloud'] as const)(
    'keeps the %s editor open with the text and the error when the save fails',
    async (scope) => {
      const update = vi.fn(async () => {
        throw new Error('The change was rejected');
      });
      render(<MemoryEditor adapter={editAdapter(scope, update)} />);

      fireEvent.click(screen.getByRole('button', { name: /^Edit memory:/ }));
      const editor = screen.getByRole('textbox', {
        name: /^Editing memory:/,
      }) as HTMLTextAreaElement;
      fireEvent.change(editor, { target: { value: 'Prefers very short answers' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByRole('alert')).toBeDefined();
      const kept = screen.getByRole('textbox', { name: /^Editing memory:/ }) as HTMLTextAreaElement;
      expect(kept.value).toBe('Prefers very short answers');
      expect(update).toHaveBeenCalledWith('memory-1', 'Prefers very short answers');
    },
  );

  it.each(['local', 'cloud'] as const)(
    'disables Save while the %s write runs and closes the editor once it lands',
    async (scope) => {
      let resolve!: (value: unknown) => void;
      const update = vi.fn(
        () =>
          new Promise<unknown>((accept) => {
            resolve = accept;
          }),
      );
      render(<MemoryEditor adapter={editAdapter(scope, update)} />);

      fireEvent.click(screen.getByRole('button', { name: /^Edit memory:/ }));
      const editor = screen.getByRole('textbox', { name: /^Editing memory:/ });
      fireEvent.change(editor, { target: { value: 'Prefers very short answers' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(screen.getByRole('textbox', { name: /^Editing memory:/ })).toBeDefined();

      await act(async () => {
        resolve({});
      });
      expect(screen.queryByRole('textbox', { name: /^Editing memory:/ })).toBeNull();
    },
  );
});
