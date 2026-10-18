import { t } from '../../i18n';
import { el } from '../side-panel/dom';

export const KEYBOARD_SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';

export interface KeyboardShortcutDependencies {
  getAll(): Promise<Array<Pick<chrome.commands.Command, 'name' | 'shortcut'>>>;
  openShortcutSettings(): Promise<unknown>;
}

export interface KeyboardShortcutRows {
  element: HTMLElement;
  loaded: Promise<void>;
}

function commandLabels(): Readonly<Record<string, string>> {
  return {
    _execute_action: t('optShortcutOpenPanel'),
    capture_page: t('optShortcutCapturePage'),
  };
}

function keycaps(shortcut: string): HTMLElement {
  const wrap = el('span', { class: 'opt-shortcut-kbd' });
  const keys = shortcut
    .split('+')
    .map((key) => key.trim())
    .filter(Boolean);
  keys.forEach((key, index) => {
    const cap = document.createElement('kbd');
    cap.textContent = key;
    wrap.appendChild(cap);
    if (index < keys.length - 1) wrap.appendChild(document.createTextNode(' + '));
  });
  return wrap;
}

export function createKeyboardShortcutRows(
  dependencies: KeyboardShortcutDependencies,
): KeyboardShortcutRows {
  const element = el('div', { class: 'opt-keyboard-shortcuts', id: 'opt-keyboard-shortcuts' });
  const list = el('div', { role: 'list' });
  const status = el('p', {
    class: 'opt-save-status',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  element.append(list, status);

  const configure = el(
    'button',
    { class: 'opt-btn-secondary', id: 'opt-shortcut-configure', type: 'button' },
    t('optShortcutConfigure'),
  );
  configure.addEventListener('click', () => {
    dependencies.openShortcutSettings().catch(() => {
      status.textContent = t('optShortcutConfigureFailed');
      status.className = 'opt-save-status error';
    });
  });

  const loaded = dependencies
    .getAll()
    .then((commands) => {
      const byName = new Map(commands.map((command) => [command.name ?? '', command]));
      for (const [name, label] of Object.entries(commandLabels())) {
        const shortcut = byName.get(name)?.shortcut;
        const row = el('div', { class: 'opt-row', role: 'listitem' });
        const text = el('div');
        text.appendChild(el('div', { class: 'opt-row-label' }, label));
        row.appendChild(text);
        const side = el('div', { class: 'opt-row-side' });
        if (shortcut) side.appendChild(keycaps(shortcut));
        else side.appendChild(el('span', { class: 'opt-row-hint' }, t('optShortcutNotAssigned')));
        if (name === '_execute_action') side.appendChild(configure);
        row.appendChild(side);
        list.appendChild(row);
      }
    })
    .catch(() => {
      status.textContent = t('optShortcutLoadFailed');
      status.className = 'opt-save-status error';
      list.appendChild(el('div', { class: 'opt-row' }, el('div', {}, configure)));
    });

  return { element, loaded };
}

export function browserKeyboardShortcutDependencies(): KeyboardShortcutDependencies {
  return {
    getAll: () => chrome.commands.getAll(),
    openShortcutSettings: () => chrome.tabs.create({ url: KEYBOARD_SHORTCUTS_PAGE }),
  };
}
