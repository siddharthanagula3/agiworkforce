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
    const edit = document.querySelector<HTMLInputElement>('.sp-memory-edit input')!;
    edit.value = 'New';
    document.querySelector<HTMLFormElement>('.sp-memory-edit')!.requestSubmit();
    await vi.waitFor(() =>
      expect(sent).toContainEqual({ type: 'UPDATE_MEMORY', id: 'm1', content: 'New' }),
    );
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { sheet, trigger } = setup([]);
    sheet.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet.element.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});
