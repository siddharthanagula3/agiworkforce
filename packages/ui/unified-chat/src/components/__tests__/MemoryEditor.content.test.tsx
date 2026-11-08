import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MANAGED_MEMORY_MAX_CONTENT_CHARS } from '@agiworkforce/types';
import { MemoryEditor, type MemoryEditorDataAdapter } from '../MemoryEditor';

describe('MemoryEditor content preservation', () => {
  it('retains a valid longer fact when the user edits it', async () => {
    const content = 'A saved reference sentence. '.repeat(30).trim();
    const edited = `${content}\nAn additional reference line.`;
    expect(edited.length).toBeLessThan(MANAGED_MEMORY_MAX_CONTENT_CHARS);
    const update = vi.fn(async () => undefined);
    const adapter: MemoryEditorDataAdapter = {
      scope: 'cloud',
      facts: [
        {
          id: 'long-memory',
          text: content,
          source: 'user',
          createdAt: '2026-11-07T00:00:00Z',
          updatedAt: '2026-11-07T00:00:00Z',
        },
      ],
      syncStatus: 'synced',
      hydrateFromServer: vi.fn(async () => undefined),
      add: vi.fn(),
      update,
      setPinned: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    };
    render(<MemoryEditor adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit memory:/ }));
    const editor = screen.getByRole('textbox', { name: /^Editing memory:/ }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: edited } });
    expect(editor.value).toBe(edited);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('long-memory', edited));
  });
});
