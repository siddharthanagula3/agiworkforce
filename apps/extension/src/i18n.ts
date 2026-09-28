import catalog from '../_locales/en/messages.json';

type MessageKey = keyof typeof catalog;

type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_other` ? Base : never;
}[MessageKey];

export function t(key: MessageKey, substitutions: readonly string[] = []): string {
  return chrome.i18n.getMessage(key, [...substitutions]);
}

export function tPlural(
  key: PluralKey,
  count: number,
  substitutions: readonly string[] = [],
): string {
  const category = new Intl.PluralRules(chrome.i18n.getUILanguage()).select(count);
  const values = [String(count), ...substitutions];
  return (
    chrome.i18n.getMessage(`${key}_${category}`, values) ||
    chrome.i18n.getMessage(`${key}_other`, values)
  );
}
