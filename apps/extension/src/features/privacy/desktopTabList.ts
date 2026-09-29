export const DESKTOP_TAB_LIST_STORAGE_KEY = 'agi_desktop_tab_list_consent';

export const DESKTOP_TAB_LIST_LABEL = 'Let AGI Desktop see your open tabs';

export const DESKTOP_TAB_LIST_REFUSAL =
  'AGI Desktop cannot list your tabs until you turn on "Let AGI Desktop see your open tabs" in the AGI extension settings.';

export function parseDesktopTabListConsent(stored: unknown): boolean {
  return stored === true;
}

export function describeDesktopTabListConsent(enabled: boolean): string {
  return enabled
    ? 'A paired AGI Desktop or CLI can list the titles and addresses of the tabs in your Chrome window so you can pick one to mention. Reading a tab still needs that site approved.'
    : 'Paired apps cannot see which tabs you have open. They can read only the active tab, on a site you approved.';
}

export async function readDesktopTabListConsent(): Promise<boolean> {
  const items = await chrome.storage.local.get(DESKTOP_TAB_LIST_STORAGE_KEY);
  return parseDesktopTabListConsent(items[DESKTOP_TAB_LIST_STORAGE_KEY]);
}
