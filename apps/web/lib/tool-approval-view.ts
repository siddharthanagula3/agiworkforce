import {
  PLATFORM_TOOL_METADATA,
  policyAutoApprovesTool,
} from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import {
  TOOL_CALL_GATE_RANKS,
  type ToolCallGateRank,
} from '@/app/api/llm/v1/chat/completions/lib/tool-call-gate';
import {
  TOOL_APPROVAL_POLICIES,
  WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
  toolApprovalPolicyOption,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
import { TOOL_COPY } from './tool-copy';

export interface ToolApprovalSource {
  toolNames: readonly string[];
  autoApproves: (policy: ToolApprovalPolicy, qualifiedName: string) => boolean;
}

export const PLATFORM_TOOL_APPROVAL_SOURCE: ToolApprovalSource = {
  toolNames: Object.keys(PLATFORM_TOOL_METADATA),
  autoApproves: policyAutoApprovesTool,
};

export interface ToolApprovalToolRow {
  name: string;
  label: string;
  description: string;
  runsWithoutAsking: readonly ToolApprovalPolicy[];
}

export interface ToolApprovalPolicyRow {
  policy: ToolApprovalPolicy;
  label: string;
  summary: string;
  isDefault: boolean;
  runsWithoutAsking: readonly string[];
}

export interface ToolApprovalPrecedenceRow {
  rank: number;
  reason: string;
  condition: string;
  outcome: string;
}

export function buildToolApprovalToolRows(
  source: ToolApprovalSource = PLATFORM_TOOL_APPROVAL_SOURCE,
): readonly ToolApprovalToolRow[] {
  return source.toolNames.map((name) => {
    const copy = TOOL_COPY[name];
    return {
      name,
      label: copy?.label ?? name,
      description: copy?.description ?? '',
      runsWithoutAsking: TOOL_APPROVAL_POLICIES.filter((policy) =>
        source.autoApproves(policy, name),
      ),
    };
  });
}

export function buildToolApprovalPolicyRows(
  source: ToolApprovalSource = PLATFORM_TOOL_APPROVAL_SOURCE,
): readonly ToolApprovalPolicyRow[] {
  const tools = buildToolApprovalToolRows(source);
  return TOOL_APPROVAL_POLICIES.map((policy) => {
    const option = toolApprovalPolicyOption(policy);
    return {
      policy,
      label: option.label,
      summary: option.hint,
      isDefault: policy === WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
      runsWithoutAsking: tools
        .filter((tool) => tool.runsWithoutAsking.includes(policy))
        .map((tool) => tool.label),
    };
  });
}

export function toolApprovalPolicySentence(row: ToolApprovalPolicyRow): string {
  const opening = row.isDefault ? `${row.summary} This is the default.` : row.summary;
  if (row.runsWithoutAsking.length === 0) return `${opening} No built-in tool runs without asking.`;
  return `${opening} Runs without asking: ${row.runsWithoutAsking.join(', ')}.`;
}

// Keyed by the rank number in completions/lib/tool-call-gate.ts, which owns the
// order and the outcomes. Only the sentence is written here.
const PRECEDENCE_CONDITION: Readonly<Record<number, string>> = {
  1: 'You blocked the tool',
  2: 'A step your own device carries out, on a turn that is connected to that device',
  3: 'You saved Always allow, and the injection escalation trips',
  4: 'You saved Always allow',
  5: 'You saved Needs approval',
  6: 'Something else in the turn needs approval, your account default covers this tool, and the escalation has not tripped',
  7: 'Something in the turn needs approval and your account default does not cover this tool',
  8: 'The injection escalation trips',
  9: 'Every tool offered in the turn runs under your account default',
};

const PRECEDENCE_OUTCOME: Readonly<Record<ToolCallGateRank['outcome'], string>> = {
  allow: 'Runs.',
  ask: 'Asks.',
  deny: 'Denied.',
  escalate: 'Asks. On an unattended run there is nobody to ask, so it is denied instead.',
};

export const TOOL_APPROVAL_PRECEDENCE: readonly ToolApprovalPrecedenceRow[] =
  TOOL_CALL_GATE_RANKS.map((rank) => ({
    rank: rank.rank,
    reason: rank.reason,
    condition: PRECEDENCE_CONDITION[rank.rank] ?? '',
    outcome: PRECEDENCE_OUTCOME[rank.outcome],
  }));
