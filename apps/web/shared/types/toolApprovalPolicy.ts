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

export interface ToolApprovalPolicyOption {
  policy: ToolApprovalPolicy;
  /** One word for a composer-sized control. */
  shortLabel: string;
  label: string;
  /** One line for a menu row, short enough not to wrap into a paragraph. */
  hint: string;
  /** The full statement, for the settings pane where the detail belongs. */
  description: string;
}

export const TOOL_APPROVAL_POLICY_OPTIONS: readonly ToolApprovalPolicyOption[] = [
  {
    policy: 'ask_every_time',
    shortLabel: 'Ask',
    label: 'Ask before every action',
    hint: 'Every tool action waits for you, reads included.',
    description:
      'Every connector, plugin, and tool action waits for your approval, including actions that only read data.',
  },
  {
    policy: 'auto_approve_read_only',
    shortLabel: 'Auto',
    label: 'Run read-only actions without asking',
    hint: 'Reads run on their own; writes still ask.',
    description:
      'Actions that only read data inside AGI run on their own. Anything that writes, deletes, runs code, or can move data outside AGI, including web search and page fetches, still asks first, and a blocked tool stays blocked.',
  },
];

export function toolApprovalPolicyOption(policy: ToolApprovalPolicy): ToolApprovalPolicyOption {
  const found = TOOL_APPROVAL_POLICY_OPTIONS.find((option) => option.policy === policy);
  if (!found) throw new Error(`Unknown tool approval policy: ${policy}`);
  return found;
}

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
