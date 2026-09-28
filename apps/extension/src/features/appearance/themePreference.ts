export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_STORAGE_KEY = 'agi_theme_preference';

export const THEME_PREFERENCE_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function parseThemePreference(stored: unknown): ThemePreference {
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function describeThemePreference(preference: ThemePreference): string {
  if (preference === 'light') return 'Always light.';
  if (preference === 'dark') return 'Always dark.';
  return "Follows your device's appearance.";
}

export function applyThemePreference(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

export function followThemePreference(root: HTMLElement = document.documentElement): void {
  try {
    chrome.storage.local.get(THEME_PREFERENCE_STORAGE_KEY, (items) => {
      if (chrome.runtime.lastError) return;
      applyThemePreference(parseThemePreference(items?.[THEME_PREFERENCE_STORAGE_KEY]), root);
    });
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes[THEME_PREFERENCE_STORAGE_KEY];
      if (change) applyThemePreference(parseThemePreference(change.newValue), root);
    });
  } catch {
    applyThemePreference('system', root);
  }
}
