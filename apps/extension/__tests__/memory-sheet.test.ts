// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from '../_locales/en/messages.json';
import { buildMemorySheet } from '../src/features/side-panel/memorySheet';

type Entry = { message: string; placeholders?: Record<string, { content: string }> };
const message = (key: string, substitutions: string[] = []): string => {
  const entry = (catalog as Record<string, Entry>)[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Z_]+)\$/g, (_match, name: string) => {
    const index = Number((entry.placeholders?.[name.toLowerCase()]?.content ?? '$0').slice(1)) - 1;
    return substitutions[index] ?? '';
  });
};

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('chrome', { i18n: { getMessage: message } });
});

function setup(memories: Array<{ id: string; content: string; source?: string }>) {
  const sent: Array<Record<string, unknown>> = [];
  const send = vi.fn(async (request: Record<string, unknown>) => {
    sent.push(request);
    if (request['type'] === 'LIST_MEMORIES')
      return { success: true, status: 'ready', memories, hasMore: false };
    return { success: true, status: 'ready' };
  });
  const sheet = buildMemorySheet({ send, openWeb: vi.fn() });
  document.body.appendChild(sheet.element);
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  sheet.open(trigger);
  return { sheet, sent, trigger };
}

const button = (root: ParentNode, label: string) =>
  Array.from(root.querySelectorAll('button')).find((node) => node.textContent === label)!;

describe('memory sheet', () => {
  it('lists the account memory with where it came from', async () => {
    setup([{ id: 'm1', content: 'Prefers metric units', source: 'chrome' }]);
    await vi.waitFor(() =>
      expect(document.querySelector('.sp-memory-text')?.textContent).toBe('Prefers metric units'),
    );
    expect(document.querySelector('.sp-memory-source')?.textContent).toBe(
      message('spMemorySourceChrome'),
    );
  });

  it('asks before deleting, names the consequence, and deletes only after confirming', async () => {
    const { sent } = setup([{ id: 'm1', content: 'Prefers metric units' }]);
    await vi.waitFor(() => expect(document.querySelector('.sp-memory-item')).toBeTruthy());
    button(document.querySelector('.sp-memory-item')!, message('spMemoryDelete')).click();
    const confirm = document.querySelector('[role="alertdialog"]')!;
    expect(confirm.textContent).toContain(message('spMemoryDeleteConfirm'));
    expect(sent.some((request) => request['type'] === 'DELETE_MEMORY')).toBe(false);
    button(confirm, message('spMemoryDelete')).click();
    await vi.waitFor(() => expect(sent).toContainEqual({ type: 'DELETE_MEMORY', id: 'm1' }));
  });

  it('adds and edits through the background memory handlers', async () => {
    const { sent } = setup([{ id: 'm1', content: 'Old' }]);
    await vi.waitFor(() => expect(document.querySelector('.sp-memory-item')).toBeTruthy());
    const add = document.querySelector<HTMLInputElement>('.sp-memory-add input')!;
    add.value = 'Lives in Austin';
    document.querySelector<HTMLFormElement>('.sp-memory-add')!.requestSubmit();
    await vi.waitFor(() =>
      expect(sent).toContainEqual({ type: 'ADD_MEMORY', content: 'Lives in Austin' }),
    );
    await vi.waitFor(() => expect(document.querySelector('.sp-memory-item')).toBeTruthy());
    button(document.querySelector('.sp-memory-item')!, message('spMemoryEdit')).click();
    const edit = document.querySelector<HTMLTextAreaElement>('.sp-memory-edit [aria-label]')!;
    edit.value = 'New';
    document.querySelector<HTMLFormElement>('.sp-memory-edit')!.requestSubmit();
    await vi.waitFor(() =>
      expect(sent).toContainEqual({ type: 'UPDATE_MEMORY', id: 'm1', content: 'New' }),
    );
  });

  it.each(['\n', '\r\n'])('preserves stored lines on unchanged save (%j)', async (separator) => {
    const content = ['First reference line.', 'Second reference line.'].join(separator);
    const { sent } = setup([{ id: 'multiline', content }]);
    await vi.waitFor(() => expect(document.querySelector('.sp-memory-item')).toBeTruthy());
    button(document.querySelector('.sp-memory-item')!, message('spMemoryEdit')).click();
    const edit = document.querySelector<HTMLTextAreaElement>('.sp-memory-edit [aria-label]')!;
    expect(edit.value).toBe(content.replace(/\r\n/g, '\n'));
    document.querySelector<HTMLFormElement>('.sp-memory-edit')!.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.some((request) => request['type'] === 'UPDATE_MEMORY')).toBe(false);
  });

  it('retains the existing lines when the user adds another line', async () => {
    const content = 'First reference line.\nSecond reference line.';
    const { sent } = setup([{ id: 'multiline', content }]);
    await vi.waitFor(() => expect(document.querySelector('.sp-memory-item')).toBeTruthy());
    button(document.querySelector('.sp-memory-item')!, message('spMemoryEdit')).click();
    const edit = document.querySelector<HTMLTextAreaElement>('.sp-memory-edit [aria-label]')!;
    edit.value += '\nThird reference line.';
    document.querySelector<HTMLFormElement>('.sp-memory-edit')!.requestSubmit();
    await vi.waitFor(() =>
      expect(sent).toContainEqual({
        type: 'UPDATE_MEMORY',
        id: 'multiline',
        content: content + '\nThird reference line.',
      }),
    );
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { sheet, trigger } = setup([]);
    sheet.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet.element.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('cancels an inline edit on Escape instead of closing the sheet and losing the edit', async () => {
    const { sheet } = setup([{ id: 'm1', content: 'Prefers metric units' }]);
    await vi.waitFor(() => expect(document.querySelector('.sp-memory-item')).toBeTruthy());
    button(document.querySelector('.sp-memory-item')!, message('spMemoryEdit')).click();
    const edit = document.querySelector<HTMLTextAreaElement>('.sp-memory-edit textarea')!;
    edit.value = 'A half-typed change';

    edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(sheet.element.hidden).toBe(false);
    await vi.waitFor(() => expect(document.querySelector('.sp-memory-edit')).toBeNull());
    expect(document.querySelector('.sp-memory-text')?.textContent).toBe('Prefers metric units');
  });

  it('keeps the memory on Escape in the delete prompt and leaves the sheet open', async () => {
    const { sheet, sent } = setup([{ id: 'm1', content: 'Prefers metric units' }]);
    await vi.waitFor(() => expect(document.querySelector('.sp-memory-item')).toBeTruthy());
    button(document.querySelector('.sp-memory-item')!, message('spMemoryDelete')).click();
    const confirm = document.querySelector('[role="alertdialog"]')!;

    confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(sheet.element.hidden).toBe(false);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(sent.some((request) => request['type'] === 'DELETE_MEMORY')).toBe(false);
  });

  it('shows the connection warning while displaying cached memory', async () => {
    const send = vi.fn(async (): Promise<unknown> => ({
      success: true,
      fromCache: true,
      memories: [],
      error: 'Memory could not be reached.',
    }));
    const sheet = buildMemorySheet({ send, openWeb: vi.fn() });
    const trigger = document.createElement('button');
    document.body.append(trigger, sheet.element);
    sheet.open(trigger);
    await vi.waitFor(() =>
      expect(sheet.element.querySelector('.sp-memory-empty')?.textContent).toBe(
        message('spMemoryEmpty'),
      ),
    );
    expect(sheet.element.querySelector('.sp-memory-status')?.textContent).toBe(
      'Memory could not be reached.',
    );
    sheet.close();
    send.mockResolvedValueOnce({ success: true, memories: [] });
    sheet.open(trigger);
    await vi.waitFor(() =>
      expect(sheet.element.querySelector('.sp-memory-empty')?.textContent).toBe(
        message('spMemoryEmpty'),
      ),
    );
    expect(sheet.element.querySelector('.sp-memory-status')?.textContent).toBe('');
  });

  it.each(['success', 'refused'] as const)(
    'ignores a late %s write after the sheet is reopened',
    async (outcome) => {
      let finish!: (response: unknown) => void;
      const send = vi.fn(async (request: Record<string, unknown>): Promise<unknown> =>
        request.type === 'ADD_MEMORY'
          ? new Promise((resolve) => (finish = resolve))
          : { success: true, memories: [] },
      );
      const sheet = buildMemorySheet({ send, openWeb: vi.fn() });
      const trigger = document.createElement('button');
      document.body.append(trigger, sheet.element);
      sheet.open(trigger);
      await vi.waitFor(() =>
        expect(sheet.element.querySelector('.sp-memory-empty')?.textContent).toBe(
          message('spMemoryEmpty'),
        ),
      );
      const input = sheet.element.querySelector<HTMLInputElement>('.sp-memory-add input')!;
      input.value = 'Old view draft';
      sheet.element.querySelector<HTMLFormElement>('.sp-memory-add')!.requestSubmit();
      await vi.waitFor(() => expect(finish).toBeDefined());
      sheet.close();
      sheet.open(trigger);
      input.value = 'New view draft';
      finish({ success: outcome === 'success', error: 'Old view failure' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(input.value).toBe('New view draft');
      expect(sheet.element.querySelector('.sp-memory-status')?.textContent).toBe('');
      expect(send.mock.calls.filter(([request]) => request.type === 'LIST_MEMORIES')).toHaveLength(
        2,
      );
    },
  );
});
