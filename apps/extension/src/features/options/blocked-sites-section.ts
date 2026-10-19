import { t } from '../../i18n';
import { el } from '../side-panel/dom';
import {
  blockSite,
  blockedSiteOrigin,
  readUserSiteBlocklist,
  unblockSite,
} from '../site-policy/userBlocklist';

export interface BlockedSitesStore {
  read(): Promise<string[]>;
  block(origin: string): Promise<string[]>;
  unblock(origin: string): Promise<string[]>;
}

const CHROME_BLOCKED_SITES: BlockedSitesStore = {
  read: () => readUserSiteBlocklist(),
  block: (origin) => blockSite(origin),
  unblock: (origin) => unblockSite(origin),
};

export interface BlockedSitesSection {
  element: HTMLElement;
  input: HTMLInputElement;
  list: HTMLElement;
  status: HTMLElement;
  loaded: Promise<void>;
  refresh(): Promise<void>;
}

export function createBlockedSitesSection(
  store: BlockedSitesStore = CHROME_BLOCKED_SITES,
): BlockedSitesSection {
  const element = el('div', { class: 'opt-row opt-blocked-sites', id: 'opt-blocked-sites' });
  const text = el('div', { class: 'opt-blocked-sites-body' });
  text.appendChild(
    el('div', { class: 'opt-row-label', id: 'opt-blocked-sites-label' }, t('optBlockedSitesTitle')),
  );
  text.appendChild(el('div', { class: 'opt-row-hint' }, t('optBlockedSitesHint')));

  const form = el('form', { class: 'opt-blocked-sites-form' });
  const input = el('input', {
    type: 'text',
    class: 'opt-bearer-input opt-blocked-sites-input',
    id: 'opt-blocked-sites-input',
    placeholder: 'example.com',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-labelledby': 'opt-blocked-sites-label',
  });
  const add = el(
    'button',
    { type: 'submit', class: 'opt-btn-secondary', id: 'opt-blocked-sites-add' },
    t('optBlockedSitesAdd'),
  );
  form.append(input, add);
  text.appendChild(form);

  const status = el('div', {
    class: 'opt-row-hint',
    id: 'opt-blocked-sites-status',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  text.appendChild(status);
  const list = el('ul', {
    class: 'opt-allowlist-list opt-blocked-sites-list',
    'aria-labelledby': 'opt-blocked-sites-label',
  });
  text.appendChild(list);

  const render = (origins: readonly string[]): void => {
    list.textContent = '';
    if (origins.length === 0) {
      list.appendChild(el('li', { class: 'opt-allowlist-empty' }, t('optBlockedSitesEmpty')));
      return;
    }
    for (const origin of origins) {
      const item = el('li', { class: 'opt-allowlist-item' });
      item.appendChild(el('span', { class: 'opt-allowlist-item-origin' }, origin));
      const remove = el(
        'button',
        {
          type: 'button',
          class: 'opt-btn-secondary',
          'aria-label': t('optBlockedSitesRemoveLabel', [origin]),
        },
        t('optBlockedSitesRemove'),
      );
      remove.addEventListener('click', () => {
        remove.disabled = true;
        void store
          .unblock(origin)
          .then((next) => {
            render(next);
            status.textContent = t('optBlockedSitesRemoved', [origin]);
          })
          .catch(() => {
            remove.disabled = false;
            status.textContent = t('optSaveFailed');
          });
      });
      item.appendChild(remove);
      list.appendChild(item);
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const origin = blockedSiteOrigin(input.value);
    if (!origin) {
      status.textContent = t('optBlockedSitesInvalid');
      return;
    }
    add.disabled = true;
    void store
      .block(origin)
      .then((next) => {
        render(next);
        input.value = '';
        status.textContent = t('optBlockedSitesAdded', [origin]);
      })
      .catch(() => {
        status.textContent = t('optSaveFailed');
      })
      .finally(() => {
        add.disabled = false;
      });
  });

  element.appendChild(text);
  const refresh = (): Promise<void> => store.read().then(render);
  return { element, input, list, status, loaded: refresh(), refresh };
}
