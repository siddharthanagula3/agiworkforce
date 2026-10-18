export const OPTIONS_DESTINATION = {
  permissions: 'opt-permissions',
  shortcuts: 'opt-shortcuts',
  help: 'opt-help',
} as const;

export type OptionsDestinationId = (typeof OPTIONS_DESTINATION)[keyof typeof OPTIONS_DESTINATION];

export function optionsDestinationUrl(target: OptionsDestinationId): string {
  return `${chrome.runtime.getURL('src/options.html')}#${target}`;
}

export function openOptionsDestination(target: OptionsDestinationId): void {
  void chrome.tabs.create({ url: optionsDestinationUrl(target) });
}
