export const TOOL_APPROVAL_PREFERENCE_NAMESPACE = 'tool-approvals';

export const TOOL_APPROVAL_POLICIES = [
  'ask_every_time',
  'auto_approve_read_only',
  'autonomous',
] as const;

export type ToolApprovalPolicy = (typeof TOOL_APPROVAL_POLICIES)[number];

export const DEFAULT_TOOL_APPROVAL_POLICY: ToolApprovalPolicy = 'ask_every_time';

export interface ToolApprovalPreferences {
  defaultPolicy: ToolApprovalPolicy;
}

export const DEFAULT_TOOL_APPROVAL_PREFERENCES: ToolApprovalPreferences = {
  defaultPolicy: DEFAULT_TOOL_APPROVAL_POLICY,
};

export const TOOL_APPROVAL_ACTION_LABELS = Object.freeze({
  allow: 'Allow',
  alwaysAllow: 'Always allow',
  ask: 'Ask',
  deny: 'Deny',
  approve: 'Approve',
  allowed: 'Allowed',
  denied: 'Denied',
});

export type ToolApprovalActionVerb = keyof typeof TOOL_APPROVAL_ACTION_LABELS;

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
    hint: 'Reads, searches, page fetches and sandboxed code run on their own; writes still ask.',
    description:
      'Actions that only read data, search the web, fetch a page, or run code in the AGI sandbox run on their own. Anything that writes, deletes, sends, buys, changes credentials, or runs on your own machine still asks, and so does every connector tool AGI does not know.',
  },
  {
    policy: 'autonomous',
    shortLabel: 'Skip',
    label: 'Skip approvals',
    hint: 'Tools run on their own. Destructive and unknown actions still ask.',
    description:
      'Tool actions run without waiting for you. Four things still stop and ask: anything AGI classifies as destructive or irreversible, such as a delete, a message or post other people receive, or a write it cannot undo; every connector tool AGI does not know; any action reached after untrusted web content entered the conversation; and anything your workspace blocks, which stays blocked. Your per-tool Deny choices in Connectors still win.',
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
