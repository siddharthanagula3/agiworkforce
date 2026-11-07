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
