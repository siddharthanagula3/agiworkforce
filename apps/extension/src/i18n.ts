import catalog from '../_locales/en/messages.json';

type MessageKey = keyof typeof catalog;

export function t(key: MessageKey, substitutions: readonly string[] = []): string {
  return chrome.i18n.getMessage(key, [...substitutions]);
}
