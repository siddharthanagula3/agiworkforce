import { z } from 'zod';
import conversationContract from './conversation-contract.json' with { type: 'json' };
import { WORKSPACE_KINDS, type WorkspaceSummary } from '@agiworkforce/types';

export const MANAGED_CLOUD_WORKSPACES_PATH = conversationContract.workspacesPath;

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
    accountId: z.string().min(1).optional(),
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

export const ManagedCloudWorkspaceLeaveReceiptSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().min(1),
  successorUserId: z.string().min(1).nullable(),
  revoked: z.object({
    sessions: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    deviceTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    apiKeys: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  sharedConnectorsUnshared: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  warnings: z.array(z.string()),
});

export type ManagedCloudWorkspaceLeaveReceipt = z.infer<
  typeof ManagedCloudWorkspaceLeaveReceiptSchema
>;

export const ManagedCloudWorkspaceOwnershipTransferReceiptSchema = z.object({
  organizationId: z.string().uuid(),
  ownerUserId: z.string().min(1),
  previousOwnerRole: z.enum(['admin', 'member', 'viewer']),
});

export type ManagedCloudWorkspaceOwnershipTransferReceipt = z.infer<
  typeof ManagedCloudWorkspaceOwnershipTransferReceiptSchema
>;
