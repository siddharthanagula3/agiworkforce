import { z } from 'zod';
import { TOOL_APPROVAL_POLICIES, TOOL_APPROVAL_PREFERENCE_NAMESPACE } from '@agiworkforce/types';

export {
  DEFAULT_TOOL_APPROVAL_POLICY,
  DEFAULT_TOOL_APPROVAL_PREFERENCES,
  TOOL_APPROVAL_POLICIES,
  TOOL_APPROVAL_POLICY_OPTIONS,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  isToolApprovalPolicy,
  toolApprovalPolicyOption,
} from '@agiworkforce/types';
export type {
  ToolApprovalPolicy,
  ToolApprovalPolicyOption,
  ToolApprovalPreferences,
} from '@agiworkforce/types';

import { DEFAULT_TOOL_APPROVAL_POLICY, type ToolApprovalPolicy } from '@agiworkforce/types';

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
