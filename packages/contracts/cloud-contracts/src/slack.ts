import { z } from 'zod';

import {
  MANAGED_CLOUD_SCHEDULE_APPROVAL_DECISIONS,
  ManagedCloudScheduleRunApprovalToolCallSchema,
} from './schedules';

export const MANAGED_CLOUD_SLACK_PATH = '/api/slack';
export const MANAGED_CLOUD_SLACK_LINK_PATH = '/api/slack/link';

export function managedCloudSlackInstallationPath(installationId: string): string {
  return `/api/slack/installations/${encodeURIComponent(installationId)}`;
}

export function managedCloudSlackAccountLinkPath(linkId: string): string {
  return `/api/slack/links/${encodeURIComponent(linkId)}`;
}

export function managedCloudSlackRunApprovalPath(runId: string): string {
  return `/api/slack/runs/${encodeURIComponent(runId)}/approval`;
}

export const ManagedCloudSlackSurfaceSchema = z.enum(['direct_message', 'channel']);
export type ManagedCloudSlackSurface = z.infer<typeof ManagedCloudSlackSurfaceSchema>;

export const ManagedCloudSlackInstallationSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  teamName: z.string().min(1),
  installedAt: z.string(),
});
export type ManagedCloudSlackInstallation = z.infer<typeof ManagedCloudSlackInstallationSchema>;

export const ManagedCloudSlackAccountLinkSchema = z.object({
  id: z.string().min(1),
  teamName: z.string().min(1),
  slackUserName: z.string().nullable(),
  workspaceName: z.string().nullable(),
  linkedAt: z.string(),
});
export type ManagedCloudSlackAccountLink = z.infer<typeof ManagedCloudSlackAccountLinkSchema>;

export const ManagedCloudSlackPendingApprovalSchema = z.object({
  runId: z.string().min(1),
  teamName: z.string().min(1),
  surface: ManagedCloudSlackSurfaceSchema,
  taskPath: z.string().nullable(),
  requestedAt: z.string(),
  expiresAt: z.string(),
  toolCalls: z.array(ManagedCloudScheduleRunApprovalToolCallSchema).min(1),
});
export type ManagedCloudSlackPendingApproval = z.infer<
  typeof ManagedCloudSlackPendingApprovalSchema
>;

export const ManagedCloudSlackOverviewSchema = z.object({
  available: z.boolean(),
  planAllowed: z.boolean(),
  requiredPlans: z.string(),
  installations: z.array(ManagedCloudSlackInstallationSchema),
  links: z.array(ManagedCloudSlackAccountLinkSchema),
  approvals: z.array(ManagedCloudSlackPendingApprovalSchema),
});
export type ManagedCloudSlackOverview = z.infer<typeof ManagedCloudSlackOverviewSchema>;

export const ManagedCloudSlackInstallationRemovedSchema = z.object({
  removed: z.string().min(1),
});
export type ManagedCloudSlackInstallationRemoved = z.infer<
  typeof ManagedCloudSlackInstallationRemovedSchema
>;

export const ManagedCloudSlackAccountUnlinkedSchema = z.object({
  removed: z.string().min(1),
});
export type ManagedCloudSlackAccountUnlinked = z.infer<
  typeof ManagedCloudSlackAccountUnlinkedSchema
>;

export const ManagedCloudSlackLinkWorkspaceSchema = z.object({
  id: z.string().nullable(),
  name: z.string().min(1),
  planAllowed: z.boolean(),
});
export type ManagedCloudSlackLinkWorkspace = z.infer<typeof ManagedCloudSlackLinkWorkspaceSchema>;

export const ManagedCloudSlackLinkPreviewSchema = z.object({
  teamName: z.string().min(1),
  expiresAt: z.string(),
  workspaces: z.array(ManagedCloudSlackLinkWorkspaceSchema).min(1),
  selectedWorkspaceId: z.string().nullable(),
  requiredPlans: z.string(),
});
export type ManagedCloudSlackLinkPreview = z.infer<typeof ManagedCloudSlackLinkPreviewSchema>;

export const ManagedCloudSlackLinkConfirmSchema = z
  .object({ token: z.string(), organizationId: z.string().uuid().nullable() })
  .strict();
export type ManagedCloudSlackLinkConfirm = z.infer<typeof ManagedCloudSlackLinkConfirmSchema>;

export const ManagedCloudSlackLinkConfirmedSchema = z.object({
  linked: z.literal(true),
  teamName: z.string().min(1),
});
export type ManagedCloudSlackLinkConfirmed = z.infer<typeof ManagedCloudSlackLinkConfirmedSchema>;

export const ManagedCloudSlackRunDecisionSchema = z.object({
  runId: z.string().min(1),
  decision: z.enum(MANAGED_CLOUD_SCHEDULE_APPROVAL_DECISIONS),
  status: z.literal('resuming'),
});
export type ManagedCloudSlackRunDecision = z.infer<typeof ManagedCloudSlackRunDecisionSchema>;
