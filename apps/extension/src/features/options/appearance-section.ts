import {
  THEME_PREFERENCE_OPTIONS,
  THEME_PREFERENCE_STORAGE_KEY,
  applyThemePreference,
  describeThemePreference,
  parseThemePreference,
  type ThemePreference,
} from '../appearance/themePreference';

export interface AppearanceStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface AppearanceSection {
  element: HTMLElement;
  select: HTMLSelectElement;
  status: HTMLElement;
  loaded: Promise<void>;
}

const SAVING_STATUS_TEXT = 'Saving…';
const LOAD_FAILURE_TEXT = 'Your theme could not be loaded, so the panel follows your device.';
const SAVE_FAILURE_TEXT = 'Could not save your theme. Please try again.';

export function createAppearanceSection(storage: AppearanceStorage): AppearanceSection {
  const element = document.createElement('section');
  element.className = 'opt-section';
  element.id = 'opt-appearance';

  const header = document.createElement('div');
  header.className = 'opt-section-header';
  const title = document.createElement('h2');
  title.className = 'opt-section-title';
  title.textContent = 'Appearance';
  header.appendChild(title);
  element.appendChild(header);

  const row = document.createElement('div');
  row.className = 'opt-row';

  const text = document.createElement('div');
  const label = document.createElement('label');
  label.className = 'opt-row-label';
  label.id = 'opt-theme-label';
  label.htmlFor = 'opt-theme-select';
  label.textContent = 'Theme';

  const status = document.createElement('div');
  status.className = 'opt-row-hint';
  status.id = 'opt-theme-description';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  text.append(label, status);

  const select = document.createElement('select');
  select.className = 'opt-policy-select';
  select.id = 'opt-theme-select';
  select.setAttribute('aria-describedby', status.id);
  for (const option of THEME_PREFERENCE_OPTIONS) {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  }
  select.value = 'system';
  select.disabled = true;

  row.append(text, select);
  element.appendChild(row);

  let current: ThemePreference = 'system';

  const loaded = storage
    .get(THEME_PREFERENCE_STORAGE_KEY)
    .then((items) => {
      current = parseThemePreference(items[THEME_PREFERENCE_STORAGE_KEY]);
      select.value = current;
      select.disabled = false;
      status.textContent = describeThemePreference(current);
      applyThemePreference(current);
    })
    .catch(() => {
      select.disabled = false;
      status.textContent = LOAD_FAILURE_TEXT;
    });

  select.addEventListener('change', () => {
    const next = parseThemePreference(select.value);
    select.disabled = true;
    status.textContent = SAVING_STATUS_TEXT;
    applyThemePreference(next);
    void storage
      .set({ [THEME_PREFERENCE_STORAGE_KEY]: next })
      .then(() => {
        current = next;
        status.textContent = describeThemePreference(next);
      })
      .catch(() => {
        select.value = current;
        applyThemePreference(current);
        status.textContent = SAVE_FAILURE_TEXT;
      })
      .finally(() => {
        select.disabled = false;
      });
  });

  return { element, select, status, loaded };
}
