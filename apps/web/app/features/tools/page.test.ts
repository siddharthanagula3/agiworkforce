import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  TOOL_APPROVAL_ACTION_LABELS,
  TOOL_APPROVAL_POLICIES,
} from '@agiworkforce/types';
import {
  TOOL_CALL_GATE_RANKS,
  resolveToolCallGate,
  type ToolCallGateContext,
} from '@/app/api/llm/v1/chat/completions/lib/tool-call-gate';
import {
  UNKNOWN_TOOL_METADATA,
  policyAutoApprovesTool,
  resolveToolMetadata,
} from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import { CLI_AVAILABILITY_NOTE } from '@/lib/surface-status';
import { buildToolApprovalPolicyRows } from '@/lib/tool-approval-view';
import { WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY } from '@shared/types/toolApprovalPolicy';

const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');
const page = read(__dirname, 'page.tsx').replace(/\s+/gu, ' ');

const UNCLASSIFIED_CONNECTOR_TOOL = 'mcp__unclassified-server__do_something';

const ESCALATING_TURN: ToolCallGateContext = {
  approvalMode: 'auto',
  toolApprovalPolicy: WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
  unattended: false,
  deviceHostPresent: false,
  untrustedContentInContext: true,
  sensitiveSourceAvailable: true,
};

describe('/features/tools describes the web approval gate, not the retained desktop build', () => {
  it('states nothing that only the retained Tauri build does', () => {
    expect(page).not.toMatch(/AGI Desktop|desktop dialog|desktop source/iu);
    expect(page).not.toMatch(/nineteen|120 seconds|120-second|Safe and Plan|Autopilot/iu);
    expect(page).not.toContain('NEVER_REMEMBERABLE');
  });

  it('reads the account default and its fallback from the policy the server reads', () => {
    expect(page).toContain(
      'const ACCOUNT_DEFAULT = toolApprovalPolicyOption(WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY);',
    );
    expect(page).toContain(
      'const WITHHELD_FALLBACK = toolApprovalPolicyOption(DEFAULT_TOOL_APPROVAL_POLICY);',
    );
    expect(page).not.toMatch(/Skip approvals|Ask before every action/u);
    expect(DEFAULT_TOOL_APPROVAL_POLICY).not.toBe(WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY);
  });

  it('lists the tools that run under the default from the gate table', () => {
    const defaultRow = buildToolApprovalPolicyRows().find((row) => row.isDefault);

    expect(defaultRow?.policy).toBe(WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY);
    expect(defaultRow?.runsWithoutAsking.length).toBeGreaterThan(0);
    expect(page).toContain(
      'buildToolApprovalPolicyRows().find((row) => row.isDefault)?.runsWithoutAsking',
    );
  });
});

describe('/features/tools, the gate order it prints', () => {
  it('says a denied tool is refused first because the gate checks it first', () => {
    expect(TOOL_CALL_GATE_RANKS[0]).toMatchObject({
      reason: 'blocked_by_user_permission',
      outcome: 'deny',
    });
    expect(page).toContain('is refused first, before any other rule is read.');
  });

  it('says Always allow yields to the escalation and Ask outranks the account default', () => {
    const escalation = TOOL_CALL_GATE_RANKS.findIndex(
      (rank) => rank.reason === 'lethal_trifecta' && rank.outcome === 'escalate',
    );
    const alwaysAllow = TOOL_CALL_GATE_RANKS.findIndex((rank) => rank.reason === 'always_allow');
    const savedAsk = TOOL_CALL_GATE_RANKS.findIndex(
      (rank) => rank.reason === 'user_requires_approval',
    );
    const accountDefault = TOOL_CALL_GATE_RANKS.findIndex(
      (rank) => rank.reason === 'account_default_read_only',
    );

    expect(escalation).toBeGreaterThan(-1);
    expect(escalation).toBeLessThan(alwaysAllow);
    expect(savedAsk).toBeLessThan(accountDefault);
    expect(page).toContain('runs, unless the escalation below trips, and then it asks.');
    expect(page).toContain('asks every time, whatever the account default says.');
  });

  it('says no account default runs an unclassified connector tool', () => {
    expect(resolveToolMetadata(UNCLASSIFIED_CONNECTOR_TOOL)).toBe(UNKNOWN_TOOL_METADATA);
    expect(UNKNOWN_TOOL_METADATA).toMatchObject({
      actionClass: 'write',
      reversible: false,
      createsEgressPath: true,
    });
    expect(read(WEB_ROOT, 'app/api/llm/v1/chat/completions/lib/tool-loop-routing.ts')).toMatch(
      /approvalMode:\s*hasMcpTools \|\|/u,
    );
    for (const policy of TOOL_APPROVAL_POLICIES) {
      expect(policyAutoApprovesTool(policy, UNCLASSIFIED_CONNECTOR_TOOL)).toBe(false);
      expect(
        resolveToolCallGate(
          {
            qualifiedName: UNCLASSIFIED_CONNECTOR_TOOL,
            savedLevel: undefined,
            batchIntroducesUntrustedContent: false,
          },
          {
            ...ESCALATING_TURN,
            approvalMode: 'manual',
            toolApprovalPolicy: policy,
            untrustedContentInContext: false,
            sensitiveSourceAvailable: false,
          },
        ).verdict,
      ).toBe('ask');
    }
    expect(page).toContain(
      'is treated as an irreversible write that can send data out, so no account default runs it on its own.',
    );
  });

  it('says an escalated call waits for a person, saved Always allow included', () => {
    for (const savedLevel of [undefined, 'allow'] as const) {
      const gate = resolveToolCallGate(
        {
          qualifiedName: UNCLASSIFIED_CONNECTOR_TOOL,
          savedLevel,
          batchIntroducesUntrustedContent: false,
        },
        ESCALATING_TURN,
      );
      expect(gate).toMatchObject({ verdict: 'ask', reason: 'lethal_trifecta' });
    }
    expect(page).toContain('the call waits for a person even if it would otherwise have run.');
  });
});

describe('/features/tools, the approval card', () => {
  const card = read(REPO_ROOT, 'packages/ui/unified-chat/src/components/ToolCallCard.tsx');
  const bubble = read(WEB_ROOT, 'features/chat/components/messages/MessageBubble.tsx');
  const loop = read(WEB_ROOT, 'app/api/llm/v1/chat/completions/lib/tool-loop.ts');
  const allowance = read(WEB_ROOT, 'features/chat/stores/chat-tool-allowance-store.ts');

  it('names the three answers from the labels the card renders', () => {
    for (const label of ['allow', 'allowForChat', 'deny'] as const) {
      expect(card).toContain(`TOOL_APPROVAL_ACTION_LABELS.${label}`);
      expect(TOOL_APPROVAL_ACTION_LABELS[label]).not.toBe('');
    }
    expect(page).toContain(
      'const { allow, allowForChat, alwaysAllow, ask, deny } = TOOL_APPROVAL_ACTION_LABELS;',
    );
    expect(page).toContain('An approval card offers {allow}, {allowForChat} and {deny}.');
  });

  it('says a high-risk approval drops the chat-wide answer because the card and the chat do', () => {
    expect(loop).toContain("const egressEscalation = gate.reason === 'lethal_trifecta';");
    expect(loop).toContain("...(egressEscalation ? { riskLevel: 'high' as const } : {})");
    expect(card).toContain('{onApproveForChat && !highRiskApproval && (');
    expect(card).toContain('TOOL_APPROVAL_HIGH_RISK_NOTICE');
    expect(bubble).toContain("entry.approval?.riskLevel === 'high' ||");
    expect(page).toContain('{TOOL_APPROVAL_HIGH_RISK_NOTICE}');
    expect(page).toContain('offers only {allow} and {deny}');
  });

  it('says the chat-wide answer lasts while the page is open because it is kept in memory', () => {
    expect(allowance).not.toMatch(/persist|localStorage|sessionStorage/u);
    expect(page).toContain('for as long as the page stays open');
  });
});

describe('/features/tools, the CLI rows', () => {
  const cli = read(REPO_ROOT, 'apps/cli/src/lib.rs');
  const permissions = read(REPO_ROOT, 'apps/cli/src/permissions.rs');
  const mcp = read(REPO_ROOT, 'apps/cli/src/mcp/mod.rs');

  it('prints the CLI state beside every CLI statement', () => {
    expect(CLI_AVAILABILITY_NOTE).not.toBe('');
    expect(page).toContain(
      "const CLI_NOTE = CLI_AVAILABILITY_NOTE ? ` ${CLI_AVAILABILITY_NOTE}` : '';",
    );
    expect(page).toContain('are not offered there.${CLI_NOTE}`');
    expect(page).toContain(
      '{CLI_AVAILABILITY_NOTE ? <Prose>{CLI_AVAILABILITY_NOTE}</Prose> : null}',
    );
  });

  it('names the tabs agi approvals list prints and the commands that edit the rules', () => {
    expect(cli).toMatch(/ApprovalsSubcommand::List => \{\s*for tab in \["allow", "ask", "deny"\]/u);
    for (const command of ['Allow', 'Ask', 'Deny', 'Session', 'Remove', 'Export', 'Import']) {
      expect(cli).toMatch(new RegExp(`ApprovalsSubcommand::${command}\\b`, 'u'));
    }
    expect(cli).toContain('ApprovalsSubcommand::Reset =>');
    expect(page).toContain(
      '<code>agi approvals list</code> prints the Allow, Ask and Deny rules; allow, ask, deny, session and remove edit them; export and import carry them to another machine; reset clears them.',
    );
    expect(page).not.toContain('Workspace tabs');
  });

  it('says where the rules are saved and how they match because the CLI does both', () => {
    expect(permissions).toContain('.join("permissions.toml")');
    expect(permissions).toContain('Permissions::from_mode(0o600)');
    expect(permissions).toContain('fn a_newline_cannot_ride_a_stored_allow()');
    expect(permissions).toContain('fn a_deny_rule_still_wins_over_an_allow_rule()');
    expect(page).toContain('<code>permissions.toml</code> under <code>~/.agiworkforce</code>');
  });

  it('says Local mode opens only a stdio MCP server because the CLI refuses the others', () => {
    expect(mcp).toContain('Stdio is the only Local transport');
    expect(mcp).toContain('fn local_privacy_allows_stdio_mcp_but_rejects_remote_transports()');
    expect(page).toContain('Inside Local mode the CLI will only open a stdio MCP server');
  });
});
