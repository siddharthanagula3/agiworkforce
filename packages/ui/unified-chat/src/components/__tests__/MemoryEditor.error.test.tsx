import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
