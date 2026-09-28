import type { ManagedCloudScheduleRunApprovalToolCall } from '@agiworkforce/cloud-contracts';

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

export interface SlackInstalledWorkspaceView {
  id: string;
  teamId: string;
  teamName: string;
  installedAt: string;
}

export interface SlackLinkedAccountView {
  id: string;
  teamName: string;
  slackUserName: string | null;
  workspaceName: string | null;
  linkedAt: string;
}

export interface SlackPendingApprovalView {
  runId: string;
  teamName: string;
  surface: 'direct_message' | 'channel';
  requestedAt: string;
  expiresAt: string;
  toolCalls: ManagedCloudScheduleRunApprovalToolCall[];
}

export interface SlackOverview {
  available: boolean;
  planAllowed: boolean;
  requiredPlans: string;
  installations: SlackInstalledWorkspaceView[];
  links: SlackLinkedAccountView[];
  approvals: SlackPendingApprovalView[];
}

export interface SlackLinkWorkspace {
  id: string | null;
  name: string;
  planAllowed: boolean;
}

export interface SlackLinkPreview {
  teamName: string;
  expiresAt: string;
  workspaces: SlackLinkWorkspace[];
  selectedWorkspaceId: string | null;
  requiredPlans: string;
}
