import { z } from 'zod';
import { WORKSPACE_KINDS, type WorkspaceSummary } from '@agiworkforce/types';

export const MANAGED_CLOUD_WORKSPACES_PATH = '/api/settings/workspaces';

export const ManagedCloudWorkspaceSummarySchema: z.ZodType<WorkspaceSummary> = z.object({
  id: z.string().min(1),
  kind: z.enum(WORKSPACE_KINDS),
  organizationId: z.string().uuid().nullable(),
  name: z.string(),
  slug: z.string(),
  isPrimary: z.boolean(),
  role: z.string().nullable(),
});

export const ManagedCloudAccountWorkspacesSchema = z
  .object({
    workspaces: z.array(ManagedCloudWorkspaceSummarySchema),
    activeWorkspaceId: z.string().min(1).nullable(),
    activeOrganizationId: z.string().uuid().nullable(),
    scope: z.enum(WORKSPACE_KINDS),
  })
  .superRefine((value, context) => {
    if (
      (value.scope === 'personal' && value.activeOrganizationId !== null) ||
      (value.scope === 'organization' &&
        (value.activeOrganizationId === null ||
          !value.workspaces.some(
            (workspace) =>
              workspace.id === value.activeWorkspaceId &&
              workspace.kind === 'organization' &&
              workspace.organizationId === value.activeOrganizationId,
          )))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Active Managed Cloud workspace could not be proven.',
      });
    }
  });

export type ManagedCloudAccountWorkspaces = z.infer<typeof ManagedCloudAccountWorkspacesSchema>;

export const ManagedCloudWorkspaceOwnershipTransferSchema = z.object({
  organizationId: z.string().uuid('organizationId must be a UUID'),
  toUserId: z.string().trim().min(1).max(255),
  outgoingOwnerRole: z.enum(['admin', 'member', 'viewer']).default('admin'),
});

export type ManagedCloudWorkspaceOwnershipTransfer = z.input<
  typeof ManagedCloudWorkspaceOwnershipTransferSchema
>;
