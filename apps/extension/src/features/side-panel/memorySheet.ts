import { X, renderIcon } from '../../assets/icons';
import type { AccountMemory } from '../cloud-bridge/memoryClient';
import { t } from '../../i18n';
import { el } from './dom';
import { wireSheetKeyboard } from './sheet';

interface MemoryListResponse {
  success?: boolean;
  status?: string;
  memories?: AccountMemory[];
  hasMore?: boolean;
  error?: string;
}

interface MemoryWriteResponse {
  success?: boolean;
  status?: string;
  error?: string;
}

export interface MemorySheetDependencies {
  send: (message: Record<string, unknown>) => Promise<unknown>;
  openWeb: (path: string) => void;
}

export interface MemorySheet {
  element: HTMLElement;
  open: (trigger: HTMLElement) => void;
  close: () => void;
}

const MEMORY_SETTINGS_PATH = '/settings/memory?from=chrome-extension';

function memorySource(memory: AccountMemory): string | null {
  if (memory.sourceConversationTitle) {
    return t('spMemorySourceChat', [memory.sourceConversationTitle]);
  }
  return memory.source === 'chrome' ? t('spMemorySourceChrome') : null;
}

export function buildMemorySheet(dependencies: MemorySheetDependencies): MemorySheet {
  const sheet = el('div', {
    id: 'sp-memory',
    class: 'sp-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'sp-memory-title',
  });
  sheet.hidden = true;
  const header = el('div', { class: 'sp-sheet-header' });
  header.appendChild(
    el('h2', { id: 'sp-memory-title', class: 'sp-sheet-title' }, t('spMemoryTitle')),
  );
  const close = el('button', { class: 'sp-sheet-close', type: 'button' });
  close.setAttribute('aria-label', t('spMemoryClose'));
  close.appendChild(renderIcon(X, 14));
  header.appendChild(close);
  sheet.appendChild(header);
  sheet.appendChild(el('p', { class: 'sp-sheet-intro' }, t('spMemoryIntro')));

  const addForm = el('form', { class: 'sp-memory-add' }) as HTMLFormElement;
  const addInput = el('input', {
    type: 'text',
    maxlength: '2000',
    autocomplete: 'off',
    placeholder: t('spMemoryAddPlaceholder'),
    'aria-label': t('spMemoryAddLabel'),
  }) as HTMLInputElement;
  const addButton = el('button', { type: 'submit', class: 'sp-memory-save' }, t('spMemoryAdd'));
  addForm.append(addInput, addButton);
  sheet.appendChild(addForm);

  const status = el('div', { class: 'sp-memory-status', role: 'status', 'aria-live': 'polite' });
  sheet.appendChild(status);
  const list = el('ul', { class: 'sp-memory-list', 'aria-label': t('spMemoryTitle') });
  sheet.appendChild(list);
  const manage = el('button', { type: 'button', class: 'sp-memory-manage' }, t('spMemoryManage'));
  manage.addEventListener('click', () => dependencies.openWeb(MEMORY_SETTINGS_PATH));
  sheet.appendChild(manage);

  let returnFocus: HTMLElement | null = null;
  let generation = 0;

  const setStatus = (text: string): void => {
    status.textContent = text;
  };

  async function write(message: Record<string, unknown>, done: string): Promise<boolean> {
    const response = (await dependencies
      .send(message)
      .catch(() => null)) as MemoryWriteResponse | null;
    if (response?.success === true) {
      setStatus(done);
      await refresh();
      return true;
    }
    setStatus(
      response?.status === 'signed-out'
        ? t('spMemorySignedOut')
        : (response?.error ?? t('spMemoryFailed')),
    );
    return false;
  }

  function renderItem(memory: AccountMemory): HTMLElement {
    const item = el('li', { class: 'sp-memory-item' });
    const text = el('p', { class: 'sp-memory-text' }, memory.content);
    item.appendChild(text);
    const source = memorySource(memory);
    if (source) item.appendChild(el('span', { class: 'sp-memory-source' }, source));
    const actions = el('div', { class: 'sp-memory-actions' });
    const edit = el('button', { type: 'button' }, t('spMemoryEdit'));
    edit.setAttribute('aria-label', t('spMemoryEditNamed', [memory.content]));
    const remove = el('button', { type: 'button', class: 'is-danger' }, t('spMemoryDelete'));
    remove.setAttribute('aria-label', t('spMemoryDeleteNamed', [memory.content]));
    actions.append(edit, remove);
    item.appendChild(actions);

    edit.addEventListener('click', () => {
      const form = el('form', { class: 'sp-memory-edit' }) as HTMLFormElement;
      const input = el('input', {
        type: 'text',
        maxlength: '2000',
        'aria-label': t('spMemoryEditLabel'),
      }) as HTMLInputElement;
      input.value = memory.content;
      const save = el('button', { type: 'submit' }, t('spMemorySave'));
      const cancel = el('button', { type: 'button' }, t('spMemoryCancel'));
      form.append(input, save, cancel);
      item.replaceChildren(form);
      input.focus();
      cancel.addEventListener('click', () => void refresh());
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const content = input.value.trim();
        if (!content || content === memory.content) {
          void refresh();
          return;
        }
        save.disabled = true;
        void write({ type: 'UPDATE_MEMORY', id: memory.id, content }, t('spMemoryUpdated')).finally(
          () => {
            save.disabled = false;
          },
        );
      });
    });

    remove.addEventListener('click', () => {
      const confirm = el('div', { class: 'sp-memory-confirm', role: 'alertdialog' });
      confirm.setAttribute('aria-label', t('spMemoryDeleteConfirm'));
      confirm.appendChild(el('p', {}, t('spMemoryDeleteConfirm')));
      const keep = el('button', { type: 'button' }, t('spMemoryKeep'));
      const confirmDelete = el(
        'button',
        { type: 'button', class: 'is-danger' },
        t('spMemoryDelete'),
      );
      confirm.append(keep, confirmDelete);
      actions.hidden = true;
      item.appendChild(confirm);
      keep.focus();
      keep.addEventListener('click', () => {
        confirm.remove();
        actions.hidden = false;
        remove.focus();
      });
      confirmDelete.addEventListener('click', () => {
        confirmDelete.disabled = true;
        void write({ type: 'DELETE_MEMORY', id: memory.id }, t('spMemoryDeleted'));
      });
    });
    return item;
  }

  async function refresh(): Promise<void> {
    const current = ++generation;
    const response = (await dependencies
      .send({ type: 'LIST_MEMORIES' })
      .catch(() => null)) as MemoryListResponse | null;
    if (current !== generation) return;
    list.replaceChildren();
    if (!response || response.success !== true) {
      setStatus(
        response?.status === 'signed-out'
          ? t('spMemorySignedOut')
          : (response?.error ?? t('spMemoryFailed')),
      );
      return;
    }
    const memories = response.memories ?? [];
    if (memories.length === 0) {
      list.appendChild(el('li', { class: 'sp-memory-empty' }, t('spMemoryEmpty')));
      return;
    }
    for (const memory of memories) list.appendChild(renderItem(memory));
    if (response.hasMore)
      list.appendChild(el('li', { class: 'sp-memory-empty' }, t('spMemoryMoreOnWeb')));
  }

  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const content = addInput.value.trim();
    if (!content) return;
    addButton.disabled = true;
    void write({ type: 'ADD_MEMORY', content }, t('spMemoryAdded'))
      .then((saved) => {
        if (saved) addInput.value = '';
      })
      .finally(() => {
        addButton.disabled = false;
      });
  });

  function closeSheet(): void {
    if (sheet.hidden) return;
    generation += 1;
    sheet.hidden = true;
    returnFocus?.focus();
    returnFocus = null;
  }

  close.addEventListener('click', closeSheet);
  wireSheetKeyboard(sheet, closeSheet);

  return {
    element: sheet,
    open(trigger) {
      returnFocus = trigger;
      sheet.hidden = false;
      setStatus('');
      list.replaceChildren(el('li', { class: 'sp-memory-empty' }, t('spMemoryLoading')));
      addInput.focus();
      void refresh();
    },
    close: closeSheet,
  };
}
