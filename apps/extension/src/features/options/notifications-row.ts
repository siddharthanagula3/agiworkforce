import { t } from '../../i18n';
import { el } from '../side-panel/dom';

export const TASK_NOTIFICATIONS_STORAGE_KEY = 'agi_task_notifications';

export interface NotificationsStorage {
  get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface NotificationsRow {
  element: HTMLElement;
  toggle: HTMLInputElement;
  status: HTMLElement;
  loaded: Promise<void>;
}

export function createNotificationsRow(storage: NotificationsStorage): NotificationsRow {
  const element = el('div', { class: 'opt-row', id: 'opt-notifications-row' });
  const text = el('div');
  text.appendChild(
    el('div', { class: 'opt-row-label', id: 'opt-notif-label' }, t('optNotificationsTitle')),
  );
  text.appendChild(
    el('div', { class: 'opt-row-hint', id: 'opt-notif-description' }, t('optNotificationsHint')),
  );
  const status = el('div', {
    class: 'opt-row-hint',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  text.appendChild(status);

  const toggle = el('input', {
    type: 'checkbox',
    class: 'opt-toggle',
    id: 'opt-notif-toggle',
    'aria-labelledby': 'opt-notif-label',
    'aria-describedby': 'opt-notif-description',
  });
  toggle.disabled = true;

  const loaded = storage
    .get({ [TASK_NOTIFICATIONS_STORAGE_KEY]: true })
    .then((items) => {
      toggle.checked = items[TASK_NOTIFICATIONS_STORAGE_KEY] !== false;
    })
    .catch(() => {
      toggle.checked = true;
    })
    .finally(() => {
      toggle.disabled = false;
    });

  toggle.addEventListener('change', () => {
    const next = toggle.checked;
    toggle.disabled = true;
    status.textContent = t('optSaving');
    void storage
      .set({ [TASK_NOTIFICATIONS_STORAGE_KEY]: next })
      .then(() => {
        status.textContent = next ? t('optNotificationsOn') : t('optNotificationsOff');
      })
      .catch(() => {
        toggle.checked = !next;
        status.textContent = t('optSaveFailed');
      })
      .finally(() => {
        toggle.disabled = false;
      });
  });

  element.append(text, toggle);
  return { element, toggle, status, loaded };
}
