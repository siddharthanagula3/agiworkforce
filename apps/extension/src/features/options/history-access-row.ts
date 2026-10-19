import { t } from '../../i18n';
import {
  hasHistoryPermission,
  removeHistoryPermission,
  requestHistoryPermission,
} from '../computer-use/historySearch';
import { el } from '../side-panel/dom';

export interface HistoryPermissionControl {
  has(): Promise<boolean>;
  request(): Promise<boolean>;
  remove(): Promise<boolean>;
}

const CHROME_HISTORY_PERMISSION: HistoryPermissionControl = {
  has: hasHistoryPermission,
  request: requestHistoryPermission,
  remove: removeHistoryPermission,
};

export interface HistoryAccessRow {
  element: HTMLElement;
  toggle: HTMLInputElement;
  status: HTMLElement;
  loaded: Promise<void>;
}

export function createHistoryAccessRow(
  permission: HistoryPermissionControl = CHROME_HISTORY_PERMISSION,
): HistoryAccessRow {
  const element = el('div', { class: 'opt-row', id: 'opt-history-row' });
  const text = el('div');
  text.appendChild(
    el('div', { class: 'opt-row-label', id: 'opt-history-label' }, t('optHistoryTitle')),
  );
  text.appendChild(
    el('div', { class: 'opt-row-hint', id: 'opt-history-description' }, t('optHistoryHint')),
  );
  const status = el('div', {
    class: 'opt-row-hint',
    id: 'opt-history-status',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  text.appendChild(status);

  const toggle = el('input', {
    type: 'checkbox',
    class: 'opt-toggle',
    id: 'opt-history-toggle',
    'aria-labelledby': 'opt-history-label',
    'aria-describedby': 'opt-history-description opt-history-status',
  });
  toggle.disabled = true;

  const show = (granted: boolean): void => {
    toggle.checked = granted;
    status.textContent = granted ? t('optHistoryOn') : t('optHistoryOff');
  };

  const refresh = (): Promise<void> =>
    permission
      .has()
      .then(show)
      .finally(() => {
        toggle.disabled = false;
      });

  toggle.addEventListener('change', () => {
    const wanted = toggle.checked;
    toggle.disabled = true;
    const change = wanted ? permission.request() : permission.remove();
    void change
      .then(async (changed) => {
        const granted = await permission.has();
        show(granted);
        if (wanted && !changed && !granted) status.textContent = t('optHistoryRefused');
      })
      .finally(() => {
        toggle.disabled = false;
      });
  });

  window.addEventListener('focus', () => void refresh());
  element.append(text, toggle);
  return { element, toggle, status, loaded: refresh() };
}
