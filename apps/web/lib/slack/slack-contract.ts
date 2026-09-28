export const SLACK_SETTINGS_SECTION = 'slack';
export const SLACK_SETTINGS_STATUS_PARAM = 'slack';
export const SLACK_INSTALL_PATH = '/api/slack/install';

export const SLACK_INSTALL_STATUSES = [
  'installed',
  'denied',
  'invalid_state',
  'unavailable',
  'workspace_install_only',
  'failed',
] as const;

export type SlackInstallStatus = (typeof SLACK_INSTALL_STATUSES)[number];

export function isSlackInstallStatus(value: unknown): value is SlackInstallStatus {
  return typeof value === 'string' && (SLACK_INSTALL_STATUSES as readonly string[]).includes(value);
}
