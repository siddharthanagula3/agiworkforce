import { z } from 'zod';

export const TOOL_APPROVAL_PREFERENCE_NAMESPACE = 'tool-approvals';

export const TOOL_APPROVAL_POLICIES = ['ask_every_time', 'auto_approve_read_only'] as const;

export type ToolApprovalPolicy = (typeof TOOL_APPROVAL_POLICIES)[number];

export const DEFAULT_TOOL_APPROVAL_POLICY: ToolApprovalPolicy = 'ask_every_time';

export interface ToolApprovalPreferences {
  defaultPolicy: ToolApprovalPolicy;
}

export const DEFAULT_TOOL_APPROVAL_PREFERENCES: ToolApprovalPreferences = {
  defaultPolicy: DEFAULT_TOOL_APPROVAL_POLICY,
};

const StoredToolApprovalSettingsSchema = z
  .object({
    [TOOL_APPROVAL_PREFERENCE_NAMESPACE]: z
      .object({ defaultPolicy: z.enum(TOOL_APPROVAL_POLICIES).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function parseToolApprovalPolicy(settings: unknown): ToolApprovalPolicy {
  const parsed = StoredToolApprovalSettingsSchema.safeParse(settings ?? {});
  if (!parsed.success) return DEFAULT_TOOL_APPROVAL_POLICY;
  return (
    parsed.data[TOOL_APPROVAL_PREFERENCE_NAMESPACE]?.defaultPolicy ?? DEFAULT_TOOL_APPROVAL_POLICY
  );
}
