import { t } from '../../i18n';
import { normalizeShortcutStartUrl } from '../shortcuts/origin';
import { el } from '../side-panel/dom';
import {
  SHORTCUT_INPUT_PLACEHOLDER,
  promptShortcutsFromSaved,
  shortcutCommand,
  shortcutCommandConflict,
  type PromptShortcut,
} from '../side-panel/pageCommands';

export interface SavedShortcutRow {
  id: string;
  name: string;
  actions: unknown[];
  createdAt: number;
  prompt?: string;
  startUrl?: string;
}

interface SuccessResponse {
  success?: boolean;
  error?: string;
}

export interface RecordableTab {
  id?: number;
  url?: string;
  lastAccessed?: number;
}

export interface ShortcutsSectionDependencies {
  send<T extends SuccessResponse>(message: Record<string, unknown>): Promise<T | undefined>;
  queryTabs(): Promise<RecordableTab[]>;
  schedules?: { sectionEl: HTMLElement; setActive(active: boolean): void };
}

export interface ShortcutsSection {
  element: HTMLElement;
  setActive(active: boolean): void;
  refresh(): Promise<void>;
}

export function pickRecordableTab(
  tabs: readonly RecordableTab[],
): { id: number; origin: string } | null {
  const candidates = tabs
    .flatMap((tab) => {
      const origin = normalizeShortcutStartUrl(tab.url);
      return tab.id !== undefined && origin
        ? [{ id: tab.id, origin, at: tab.lastAccessed ?? 0 }]
        : [];
    })
    .sort((a, b) => b.at - a.at);
  const best = candidates[0];
  return best ? { id: best.id, origin: best.origin } : null;
}

export function createShortcutsSection(
  dependencies: ShortcutsSectionDependencies,
): ShortcutsSection {
  const { send } = dependencies;
  const element = el('section', { class: 'opt-section', id: 'opt-shortcuts' });
  const header = el('div', { class: 'opt-section-header' });
  header.appendChild(el('h2', { class: 'opt-section-title' }, t('optShortcutsTitle')));
  header.appendChild(
    el('div', { class: 'opt-row-hint', style: 'padding-top:4px' }, t('optShortcutsHint')),
  );
  element.appendChild(header);

  const status = el('div', {
    class: 'opt-save-status',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  const announce = (message: string, error = false): void => {
    status.textContent = message;
    status.className = `opt-save-status${error ? ' error' : ''}`;
  };

  let saved: SavedShortcutRow[] = [];
  const promptShortcuts = (): PromptShortcut[] => promptShortcutsFromSaved(saved);

  const toolbar = el('div', { class: 'opt-row' });
  toolbar.appendChild(
    el(
      'div',
      {},
      el('div', { class: 'opt-row-label' }, t('optShortcutsSavedTitle')),
      el('div', { class: 'opt-row-hint' }, t('optShortcutsSavedHint')),
    ),
  );
  const createButton = el(
    'button',
    { class: 'opt-btn-secondary', id: 'opt-shortcut-create', type: 'button' },
    t('spShortcutCreate'),
  );
  toolbar.appendChild(createButton);
  element.appendChild(toolbar);

  const form = el('form', {
    class: 'opt-shortcut-form',
    id: 'opt-shortcut-form',
    'aria-labelledby': 'opt-shortcut-form-title',
  });
  form.hidden = true;
  form.noValidate = true;
  const formTitle = el('h3', { class: 'opt-row-label', id: 'opt-shortcut-form-title' });
  const nameInput = el('input', {
    type: 'text',
    id: 'opt-shortcut-name',
    autocomplete: 'off',
    maxlength: '60',
  });
  const commandHint = el('div', { class: 'opt-row-hint', id: 'opt-shortcut-command-hint' });
  const promptInput = el('textarea', {
    id: 'opt-shortcut-prompt',
    rows: '4',
    placeholder: t('spShortcutPromptPlaceholder', [SHORTCUT_INPUT_PLACEHOLDER]),
    'aria-describedby': 'opt-shortcut-input-hint',
  });
  const formError = el('div', {
    class: 'opt-save-status error',
    id: 'opt-shortcut-error',
    role: 'alert',
  });
  const saveButton = el('button', { class: 'opt-btn-primary', type: 'submit' });
  const cancelButton = el('button', { class: 'opt-btn-secondary', type: 'button' }, t('optCancel'));
  form.append(
    formTitle,
    el(
      'div',
      { class: 'opt-field' },
      el('label', { for: 'opt-shortcut-name' }, t('optShortcutNameLabel')),
      nameInput,
      commandHint,
    ),
    el(
      'div',
      { class: 'opt-field' },
      el('label', { for: 'opt-shortcut-prompt' }, t('optShortcutPromptLabel')),
      promptInput,
      el(
        'div',
        { class: 'opt-row-hint', id: 'opt-shortcut-input-hint' },
        t('spShortcutInputHint', [SHORTCUT_INPUT_PLACEHOLDER]),
      ),
    ),
    formError,
    el('div', { class: 'opt-profile-actions' }, saveButton, cancelButton),
  );
  element.appendChild(form);

  let editingId: string | null = null;

  const renderCommandHint = (): void => {
    const command = shortcutCommand(nameInput.value);
    commandHint.textContent = command ? t('spShortcutCommandHint', [command]) : '';
  };
  nameInput.addEventListener('input', renderCommandHint);

  const openForm = (shortcut: PromptShortcut | null): void => {
    editingId = shortcut?.id ?? null;
    nameInput.value = shortcut?.name ?? '';
    promptInput.value = shortcut?.prompt ?? '';
    nameInput.removeAttribute('aria-invalid');
    promptInput.removeAttribute('aria-invalid');
    formError.textContent = '';
    formTitle.textContent = shortcut ? t('spShortcutEditTitle') : t('spShortcutCreate');
    saveButton.textContent = shortcut ? t('spShortcutSaveChanges') : t('spShortcutCreate');
    renderCommandHint();
    form.hidden = false;
    createButton.setAttribute('aria-expanded', 'true');
    nameInput.focus();
  };
  const closeForm = (): void => {
    form.hidden = true;
    editingId = null;
    createButton.setAttribute('aria-expanded', 'false');
    createButton.focus();
  };
  createButton.setAttribute('aria-controls', 'opt-shortcut-form');
  createButton.setAttribute('aria-expanded', 'false');
  createButton.addEventListener('click', () => openForm(null));
  cancelButton.addEventListener('click', closeForm);
  form.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeForm();
  });

  const reject = (field: HTMLElement, message: string): void => {
    nameInput.removeAttribute('aria-invalid');
    promptInput.removeAttribute('aria-invalid');
    field.setAttribute('aria-invalid', 'true');
    formError.textContent = message;
    field.focus();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const prompt = promptInput.value.trim();
    const editing = editingId;
    const conflict = shortcutCommandConflict(name, promptShortcuts(), editing ?? undefined);
    if (conflict === 'unnamed') return reject(nameInput, t('spShortcutNameUnusable'));
    if (conflict === 'taken') {
      return reject(nameInput, t('spShortcutNameTaken', [shortcutCommand(name)]));
    }
    if (!prompt.split(SHORTCUT_INPUT_PLACEHOLDER).join('').trim()) {
      return reject(promptInput, t('spShortcutPromptMissing'));
    }
    nameInput.removeAttribute('aria-invalid');
    promptInput.removeAttribute('aria-invalid');
    formError.textContent = '';
    saveButton.disabled = true;
    saveButton.textContent = t('spShortcutSaving');
    void send<SuccessResponse>(
      editing
        ? { type: 'UPDATE_SHORTCUT', shortcutId: editing, name, prompt }
        : { type: 'SAVE_SHORTCUT', name, actions: [], prompt },
    )
      .then(async (response) => {
        if (!response?.success) {
          formError.textContent = response?.error ?? t('spShortcutSaveFailed');
          return;
        }
        closeForm();
        announce(editing ? t('spShortcutUpdated', [name]) : t('optShortcutCreated', [name]));
        await refresh();
      })
      .catch(() => {
        formError.textContent = t('spShortcutSaveFailed');
      })
      .finally(() => {
        saveButton.disabled = false;
        saveButton.textContent = editing ? t('spShortcutSaveChanges') : t('spShortcutCreate');
      });
  });

  const list = el('div', { class: 'opt-shortcut-list', id: 'opt-shortcut-list', role: 'list' });
  element.appendChild(list);
  element.appendChild(status);

  const renderList = (): void => {
    list.replaceChildren();
    if (saved.length === 0) {
      list.appendChild(el('p', { class: 'opt-allowlist-empty' }, t('optShortcutsEmpty')));
      return;
    }
    const prompts = promptShortcuts();
    for (const shortcut of saved) {
      const promptShortcut = prompts.find((candidate) => candidate.id === shortcut.id);
      const command =
        promptShortcut &&
        shortcutCommandConflict(promptShortcut.name, prompts, promptShortcut.id) === null
          ? shortcutCommand(promptShortcut.name)
          : '';
      const row = el('div', { class: 'opt-row opt-shortcut-row', role: 'listitem' });
      const text = el('div');
      text.appendChild(el('div', { class: 'opt-row-label' }, shortcut.name));
      const date = new Date(shortcut.createdAt).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      });
      text.appendChild(
        el(
          'div',
          { class: 'opt-row-hint' },
          promptShortcut
            ? `${command || t('optShortcutPromptKind')} · ${date}`
            : t('optShortcutRecordedMeta', [String(shortcut.actions.length), date]),
        ),
      );
      row.appendChild(text);

      const actions = el('div', { class: 'opt-row-side' });
      const run = el('button', { class: 'opt-btn-secondary', type: 'button' }, t('optShortcutRun'));
      run.setAttribute('aria-label', t('optShortcutRunAria', [shortcut.name]));
      run.addEventListener('click', () => {
        run.disabled = true;
        announce(t('spWorkflowRunning', [shortcut.name]));
        void send<SuccessResponse>({ type: 'REPLAY_SHORTCUT', shortcutId: shortcut.id })
          .then((response) =>
            response?.success
              ? announce(t('spWorkflowCompleted', [shortcut.name]))
              : announce(t('spWorkflowRunFailed', [shortcut.name]), true),
          )
          .catch(() => announce(t('spWorkflowRunFailed', [shortcut.name]), true))
          .finally(() => {
            run.disabled = false;
          });
      });
      actions.appendChild(run);

      if (promptShortcut) {
        const edit = el(
          'button',
          { class: 'opt-btn-secondary', type: 'button' },
          t('optShortcutEdit'),
        );
        edit.setAttribute('aria-label', t('spShortcutEdit', [shortcut.name]));
        edit.addEventListener('click', () => openForm(promptShortcut));
        actions.appendChild(edit);
      }

      const remove = el(
        'button',
        { class: 'opt-btn-danger', type: 'button' },
        t('spShortcutDelete'),
      );
      remove.setAttribute('aria-label', t('optShortcutDeleteAria', [shortcut.name]));
      remove.addEventListener('click', () => {
        confirmDelete(row, shortcut, command, remove);
      });
      actions.appendChild(remove);
      row.appendChild(actions);
      list.appendChild(row);
    }
  };

  const confirmDelete = (
    row: HTMLElement,
    shortcut: SavedShortcutRow,
    command: string,
    trigger: HTMLButtonElement,
  ): void => {
    row.querySelector('.opt-confirm')?.remove();
    const box = el('div', { class: 'opt-confirm', role: 'group' });
    box.setAttribute('aria-label', t('optShortcutDeleteAria', [shortcut.name]));
    const message = command
      ? t('spShortcutDeleteConfirm', [shortcut.name, command])
      : t('spWorkflowDeleteConfirm', [shortcut.name]);
    box.appendChild(el('div', { class: 'opt-row-hint' }, message));
    const confirm = el(
      'button',
      { class: 'opt-btn-danger', type: 'button' },
      t('spShortcutDelete'),
    );
    const keep = el('button', { class: 'opt-btn-secondary', type: 'button' }, t('optKeep'));
    keep.addEventListener('click', () => {
      box.remove();
      trigger.focus();
    });
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      keep.disabled = true;
      announce(t('spWorkflowDeleting', [shortcut.name]));
      void send<SuccessResponse>({ type: 'DELETE_SHORTCUT', shortcutId: shortcut.id })
        .then(async (response) => {
          if (!response?.success) {
            confirm.disabled = false;
            keep.disabled = false;
            announce(t('spWorkflowDeleteFailed', [shortcut.name]), true);
            return;
          }
          announce(t('spWorkflowDeleted', [shortcut.name]));
          await refresh();
        })
        .catch(() => {
          confirm.disabled = false;
          keep.disabled = false;
          announce(t('spWorkflowDeleteFailed', [shortcut.name]), true);
        });
    });
    box.append(el('div', { class: 'opt-profile-actions' }, confirm, keep));
    row.appendChild(box);
    keep.focus();
  };

  const refresh = async (): Promise<void> => {
    try {
      const response = await send<SuccessResponse & { shortcuts?: SavedShortcutRow[] }>({
        type: 'LIST_SHORTCUTS',
      });
      if (!response?.success) throw new Error('list failed');
      saved = response.shortcuts ?? [];
      renderList();
    } catch {
      announce(t('spWorkflowLoadFailed'), true);
    }
  };

  const recording = buildRecordingRows(dependencies, announce, refresh);
  element.appendChild(recording);

  if (dependencies.schedules) {
    const schedules = el('div', { class: 'opt-shortcut-schedules' });
    schedules.appendChild(dependencies.schedules.sectionEl);
    element.appendChild(schedules);
  }

  renderList();

  return {
    element,
    refresh,
    setActive(active: boolean): void {
      dependencies.schedules?.setActive(active);
      if (active) void refresh();
    },
  };
}

function buildRecordingRows(
  dependencies: ShortcutsSectionDependencies,
  announce: (message: string, error?: boolean) => void,
  refreshList: () => Promise<void>,
): HTMLElement {
  const { send } = dependencies;
  const wrap = el('div', { class: 'opt-recording' });

  const row = el('div', { class: 'opt-row' });
  row.appendChild(
    el(
      'div',
      {},
      el('div', { class: 'opt-row-label' }, t('optRecordTitle')),
      el('div', { class: 'opt-row-hint', id: 'opt-record-hint' }, t('optRecordHint')),
    ),
  );
  const button = el(
    'button',
    {
      class: 'opt-btn-secondary',
      id: 'opt-record-btn',
      type: 'button',
      'aria-describedby': 'opt-record-hint',
    },
    t('optRecordStart'),
  );
  row.appendChild(button);
  wrap.appendChild(row);

  const captureRow = el('label', { class: 'opt-row opt-record-capture' });
  const capture = el('input', { type: 'checkbox', id: 'opt-record-capture' });
  captureRow.append(capture, el('span', { class: 'opt-row-hint' }, t('optRecordCaptureValues')));
  wrap.appendChild(captureRow);

  const saveBox = el('form', { class: 'opt-shortcut-form', id: 'opt-record-save' });
  saveBox.hidden = true;
  saveBox.noValidate = true;
  const saveName = el('input', {
    type: 'text',
    id: 'opt-record-name',
    autocomplete: 'off',
    maxlength: '60',
    'aria-label': t('optRecordNameLabel'),
    placeholder: t('optRecordNameLabel'),
  });
  const saveError = el('div', { class: 'opt-save-status error', role: 'alert' });
  const saveConfirm = el(
    'button',
    { class: 'opt-btn-primary', type: 'submit' },
    t('optRecordSave'),
  );
  const saveDiscard = el(
    'button',
    { class: 'opt-btn-secondary', type: 'button' },
    t('optRecordDiscard'),
  );
  saveBox.append(
    saveName,
    saveError,
    el('div', { class: 'opt-profile-actions' }, saveConfirm, saveDiscard),
  );
  wrap.appendChild(saveBox);

  let target: { id: number; origin: string } | null = null;
  let recording = false;
  let awaitingName = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const stopPoll = (): void => {
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = null;
  };

  const setCapture = async (tabId: number): Promise<boolean> => {
    try {
      const response = await send<SuccessResponse>({
        type: 'SET_RECORDING_VALUE_CAPTURE',
        enabled: capture.checked,
        tabId,
      });
      return Boolean(response?.success);
    } catch {
      return false;
    }
  };

  button.addEventListener('click', () => {
    button.disabled = true;
    void (async () => {
      try {
        if (!recording) {
          const tab = pickRecordableTab(await dependencies.queryTabs());
          if (!tab) {
            announce(t('optRecordNoTab'), true);
            return;
          }
          if (!(await setCapture(tab.id))) {
            announce(t('spRecordingPrivacySaveFailed'), true);
            return;
          }
          const response = await send<SuccessResponse>({ type: 'START_RECORDING', tabId: tab.id });
          if (!response?.success) {
            announce(response?.error ?? t('optRecordStartFailed'), true);
            return;
          }
          target = tab;
          recording = true;
          saveBox.hidden = true;
          button.textContent = t('optRecordStop');
          const host = new URL(tab.origin).host;
          announce(t('optRecordRecording', [host]));
          pollTimer = setInterval(() => {
            void send<SuccessResponse & { actions?: unknown[] }>({
              type: 'GET_RECORDED_ACTIONS',
              tabId: tab.id,
            })
              .then((response) => {
                if (response?.success) {
                  announce(
                    t('optRecordCount', [
                      new URL(tab.origin).host,
                      String(response.actions?.length ?? 0),
                    ]),
                  );
                }
              })
              .catch(() => undefined);
          }, 1500);
          return;
        }
        const response = await send<SuccessResponse>({
          type: 'STOP_RECORDING',
          tabId: target?.id,
        });
        if (!response?.success) {
          announce(response?.error ?? t('optRecordStopFailed'), true);
          return;
        }
        recording = false;
        stopPoll();
        awaitingName = true;
        button.textContent = t('optRecordStart');
        saveBox.hidden = false;
        saveName.value = '';
        saveName.focus();
        announce(t('optRecordNameIt'));
      } catch {
        announce(recording ? t('optRecordStopFailed') : t('optRecordStartFailed'), true);
      } finally {
        button.disabled = false;
      }
    })();
  });

  saveDiscard.addEventListener('click', () => {
    saveBox.hidden = true;
    awaitingName = false;
    target = null;
    announce(t('optRecordDiscarded'));
    button.focus();
  });

  saveBox.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = saveName.value.trim();
    if (!name) {
      saveError.textContent = t('optRecordNameMissing');
      saveName.setAttribute('aria-invalid', 'true');
      saveName.focus();
      return;
    }
    if (!awaitingName || !target) return;
    const tab = target;
    saveConfirm.disabled = true;
    void (async () => {
      try {
        const recorded = await send<SuccessResponse & { actions?: unknown[] }>({
          type: 'GET_RECORDED_ACTIONS',
          tabId: tab.id,
        });
        const actions = recorded?.actions ?? [];
        if (!recorded?.success || actions.length === 0) {
          saveError.textContent = t('optRecordNothing');
          return;
        }
        const saved = await send<SuccessResponse>({
          type: 'SAVE_SHORTCUT',
          name,
          actions,
          startUrl: tab.origin,
        });
        if (!saved?.success) {
          saveError.textContent = saved?.error ?? t('spShortcutSaveFailed');
          return;
        }
        saveError.textContent = '';
        saveName.removeAttribute('aria-invalid');
        saveBox.hidden = true;
        awaitingName = false;
        target = null;
        announce(t('optShortcutCreated', [name]));
        await refreshList();
      } catch {
        saveError.textContent = t('spShortcutSaveFailed');
      } finally {
        saveConfirm.disabled = false;
      }
    })();
  });

  return wrap;
}

export function browserShortcutsDependencies(
  schedules?: ShortcutsSectionDependencies['schedules'],
): ShortcutsSectionDependencies {
  return {
    send: async <T extends SuccessResponse>(message: Record<string, unknown>) =>
      (await chrome.runtime.sendMessage(message)) as T | undefined,
    queryTabs: () => chrome.tabs.query({}),
    ...(schedules ? { schedules } : {}),
  };
}
