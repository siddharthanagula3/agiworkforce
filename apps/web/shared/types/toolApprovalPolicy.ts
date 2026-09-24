import { z } from 'zod';
import { TOOL_APPROVAL_POLICIES, TOOL_APPROVAL_PREFERENCE_NAMESPACE } from '@agiworkforce/types';

export {
  AUTONOMOUS_TOOL_APPROVALS_ORGANIZATION_KEY,
  DEFAULT_TOOL_APPROVAL_POLICY,
  DEFAULT_TOOL_APPROVAL_PREFERENCES,
  TOOL_APPROVAL_POLICIES,
  TOOL_APPROVAL_POLICY_OPTIONS,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  isToolApprovalPolicy,
  organizationPermitsAutonomousToolApprovals,
  resolveEffectiveToolApprovalPolicy,
  toolApprovalPolicyOption,
} from '@agiworkforce/types';
export type {
  ToolApprovalPolicy,
  ToolApprovalPolicyOption,
  ToolApprovalPreferences,
} from '@agiworkforce/types';

import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  type ToolApprovalPolicy,
  type ToolApprovalPreferences,
} from '@agiworkforce/types';

export const WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY: ToolApprovalPolicy = 'autonomous';

export const WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_PREFERENCES: ToolApprovalPreferences = {
  defaultPolicy: WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
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
    parsed.data[TOOL_APPROVAL_PREFERENCE_NAMESPACE]?.defaultPolicy ??
    WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY
  );
}
