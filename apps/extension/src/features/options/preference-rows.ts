import { t } from '../../i18n';
import {
  dictationLanguageChoices,
  readDictationLanguage,
  resolveDictationLanguage,
  writeDictationLanguage,
} from '../side-panel/dictation-language';
import { el } from '../side-panel/dom';

export const IN_PAGE_PANEL_ENABLED_STORAGE_KEY = 'in_page_panel_enabled';

export interface PreferenceStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface PreferenceRow {
  element: HTMLElement;
  control: HTMLInputElement | HTMLSelectElement;
  status: HTMLElement;
  loaded: Promise<void>;
}

function statusLine(): HTMLElement {
  return el('div', {
    class: 'opt-row-hint',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
}

export function createInPageAssistantRow(storage: PreferenceStorage): PreferenceRow {
  const element = el('div', { class: 'opt-row', id: 'opt-in-page-row' });
  const text = el('div');
  text.appendChild(
    el('div', { class: 'opt-row-label', id: 'opt-in-page-label' }, t('spPageAssistantOverlay')),
  );
  text.appendChild(
    el('div', { class: 'opt-row-hint', id: 'opt-in-page-hint' }, t('spPageAssistantOneShot')),
  );
  const status = statusLine();
  text.appendChild(status);
  const toggle = el('input', {
    type: 'checkbox',
    class: 'opt-toggle',
    id: 'opt-in-page-toggle',
    'aria-labelledby': 'opt-in-page-label',
    'aria-describedby': 'opt-in-page-hint',
  });
  toggle.checked = true;
  toggle.disabled = true;

  const loaded = storage
    .get(IN_PAGE_PANEL_ENABLED_STORAGE_KEY)
    .then((items) => {
      toggle.checked = items[IN_PAGE_PANEL_ENABLED_STORAGE_KEY] !== false;
    })
    .catch(() => undefined)
    .finally(() => {
      toggle.disabled = false;
    });

  toggle.addEventListener('change', () => {
    const next = toggle.checked;
    toggle.disabled = true;
    status.textContent = t('spPageAssistantSaving');
    void storage
      .set({ [IN_PAGE_PANEL_ENABLED_STORAGE_KEY]: next })
      .then(() => {
        status.textContent = next ? t('spPageAssistantEnabled') : t('spPageAssistantDisabled');
      })
      .catch(() => {
        toggle.checked = !next;
        status.textContent = t('spPreferenceSaveFailed');
      })
      .finally(() => {
        toggle.disabled = false;
      });
  });

  element.append(text, toggle);
  return { element, control: toggle, status, loaded };
}

export function createDictationLanguageRow(
  environment: { languages?: readonly string[]; language?: string } = navigator,
): PreferenceRow {
  const element = el('div', { class: 'opt-row', id: 'opt-dictation-row' });
  const text = el('div');
  text.appendChild(
    el(
      'label',
      { class: 'opt-row-label', for: 'opt-dictation-select' },
      t('spDictationSectionTitle'),
    ),
  );
  text.appendChild(
    el('div', { class: 'opt-row-hint', id: 'opt-dictation-hint' }, t('spDictationLanguageHelp')),
  );
  const status = statusLine();
  text.appendChild(status);
  const select = el('select', {
    class: 'opt-policy-select',
    id: 'opt-dictation-select',
    'aria-describedby': 'opt-dictation-hint',
  });
  select.disabled = true;

  const loaded = readDictationLanguage().then((stored) => {
    const choices = dictationLanguageChoices(stored, environment);
    if (choices.length === 0) {
      status.textContent = t('spDictationLanguageUnavailable');
      return;
    }
    for (const choice of choices) {
      select.appendChild(el('option', { value: choice.tag }, choice.label));
    }
    select.value = resolveDictationLanguage(stored, environment) ?? choices[0]!.tag;
    select.disabled = false;
  });

  select.addEventListener('change', () => {
    const next = select.value;
    select.disabled = true;
    void writeDictationLanguage(next)
      .then(() => {
        status.textContent = t('spDictationLanguageSaved');
      })
      .catch(() => {
        status.textContent = t('spPreferenceSaveFailed');
      })
      .finally(() => {
        select.disabled = false;
      });
  });

  element.append(text, select);
  return { element, control: select, status, loaded };
}
