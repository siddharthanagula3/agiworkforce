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

const TOOL_COPY: Readonly<Record<string, { label: string; description: string }>> = {
  web_search: {
    label: 'Web search',
    description:
      'Runs a search and reads the results. Classified as a read that accepts untrusted content and creates an egress path, because a search query is a place secrets can leak and a result page is attacker-influenced text.',
  },
  search_maps: {
    label: 'Map search',
    description:
      'Looks up a place or a route and renders a map card in the conversation. A search, not a verified place identity and not turn-by-turn navigation.',
  },
  url_fetch: {
    label: 'Fetch a page',
    description:
      'Fetches a single URL through an SSRF-guarded path. Same classification as search, for the same reasons.',
  },
  execute_code: {
    label: 'Run code',
    description:
      'Executes model-authored code in an isolated cloud sandbox belonging to that conversation, not on your device. Classified as an irreversible execute action that creates an egress path.',
  },
  write_file: {
    label: 'Write a file',
    description:
      "Writes a file inside the conversation's own sandbox workspace. Not your filesystem, not your cloud storage. Classified as an irreversible write, so no account default runs it on its own.",
  },
  create_folder: {
    label: 'Create a folder',
    description: 'Creates a folder in that same sandbox workspace. Reversible, and no egress path.',
  },
  list_files: {
    label: 'List files',
    description: 'Lists what is in that sandbox workspace. Reads nothing outside it.',
  },
  read_file: {
    label: 'Read a file',
    description:
      'Reads a file back out of that sandbox workspace. Classified as accepting untrusted content, because whatever a previous step wrote there can be attacker-influenced.',
  },
  edit_file: {
    label: 'Edit a file',
    description:
      'Edits a file already in that sandbox workspace. Classified as an irreversible write, so no account default runs it on its own.',
  },
  create_office_file: {
    label: 'Create a document file',
    description:
      'Generates a Word document (.docx), a PowerPoint deck (.pptx), an Excel workbook (.xlsx), a PDF (.pdf) or a CSV (.csv) on our servers and attaches it to the conversation for you to download. Those five formats are the whole of it, and it never edits a file you already have. Reversible, no egress path.',
  },
  skill: {
    label: 'Run a skill',
    description:
      "Loads a skill's instructions into the turn. Skills act through the tools above and are gated by them.",
  },
};

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
