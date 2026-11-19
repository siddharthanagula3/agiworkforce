export const TOOL_APPROVAL_PREFERENCE_NAMESPACE = 'tool-approvals';

export const TOOL_APPROVAL_POLICIES = [
  'ask_every_time',
  'auto_approve_read_only',
  'autonomous',
] as const;

export type ToolApprovalPolicy = (typeof TOOL_APPROVAL_POLICIES)[number];

export const DEFAULT_TOOL_APPROVAL_POLICY: ToolApprovalPolicy = 'ask_every_time';

export const CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY: ToolApprovalPolicy = 'autonomous';

export interface ToolApprovalPreferences {
  defaultPolicy: ToolApprovalPolicy;
}

export const DEFAULT_TOOL_APPROVAL_PREFERENCES: ToolApprovalPreferences = {
  defaultPolicy: DEFAULT_TOOL_APPROVAL_POLICY,
};

export const TOOL_APPROVAL_ACTION_LABELS = Object.freeze({
  allow: 'Allow',
  allowOnce: 'Allow once',
  allowForConversation: 'Allow for this chat',
  alwaysAllow: 'Always allow',
  allowForChat: 'Allow for this chat',
  ask: 'Ask',
  deny: 'Deny',
  approve: 'Approve',
  allowed: 'Allowed',
  denied: 'Denied',
});

export type ToolApprovalActionVerb = keyof typeof TOOL_APPROVAL_ACTION_LABELS;

export const TOOL_APPROVAL_HIGH_RISK_NOTICE =
  'Private data from this chat could be sent outside AGI. Check where it goes before you allow it.';

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
    description: 'Every connector, plugin and tool action waits for your approval, reads included.',
  },
  {
    policy: 'auto_approve_read_only',
    shortLabel: 'Auto',
    label: 'Run read-only actions without asking',
    hint: 'Reads, searches, page fetches and sandboxed code run on their own; writes still ask.',
    description:
      'Reads, searches, page fetches and sandbox code run on their own. Writes, sends, purchases, credential changes, actions on your machine and unknown tools still ask.',
  },
  {
    policy: 'autonomous',
    shortLabel: 'Skip',
    label: 'Skip approvals',
    hint: 'Tools run on their own. Destructive and unknown actions still ask.',
    description:
      'Tools run without waiting. Destructive or irreversible actions, unknown connector tools, and sends after untrusted content meets private data still ask. Workspace blocks and your Deny choices win.',
  },
];

// Lives on the workspace policy, never in the member's own settings: the point
// of the switch is that the member cannot set it.
export const AUTONOMOUS_TOOL_APPROVALS_ORGANIZATION_KEY = 'allowAutonomousToolApprovals';

// Absent permits, because an unconfigured workspace is ungoverned; any other
// non-`true` value forbids, so a mistyped admin write cannot read as consent.
export function organizationPermitsAutonomousToolApprovals(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
): boolean {
  const value = metadata?.[AUTONOMOUS_TOOL_APPROVALS_ORGANIZATION_KEY];
  return value === undefined || value === null ? true : value === true;
}

// A forbidden workspace drops to the fail-closed default, not to the read-only
// policy: the member never chose that middle setting.
export function resolveEffectiveToolApprovalPolicy(
  stored: ToolApprovalPolicy,
  context: { organizationPermitsAutonomous: boolean },
): ToolApprovalPolicy {
  if (stored === 'autonomous' && !context.organizationPermitsAutonomous) {
    return DEFAULT_TOOL_APPROVAL_POLICY;
  }
  return stored;
}

export function toolApprovalPolicyOption(policy: ToolApprovalPolicy): ToolApprovalPolicyOption {
  const found = TOOL_APPROVAL_POLICY_OPTIONS.find((option) => option.policy === policy);
  if (!found) throw new Error(`Unknown tool approval policy: ${policy}`);
  return found;
}

export function isToolApprovalPolicy(value: unknown): value is ToolApprovalPolicy {
  return typeof value === 'string' && (TOOL_APPROVAL_POLICIES as readonly string[]).includes(value);
}
