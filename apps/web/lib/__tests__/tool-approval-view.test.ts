import { describe, expect, it } from 'vitest';

import {
  PLATFORM_TOOL_METADATA,
  policyAutoApprovesTool,
} from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import { TOOL_CALL_GATE_RANKS } from '@/app/api/llm/v1/chat/completions/lib/tool-call-gate';
import {
  TOOL_APPROVAL_POLICIES,
  WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
  toolApprovalPolicyOption,
} from '@shared/types/toolApprovalPolicy';
import {
  buildToolApprovalPolicyRows,
  buildToolApprovalToolRows,
  toolApprovalPolicySentence,
  TOOL_APPROVAL_PRECEDENCE,
} from '@/lib/tool-approval-view';

describe('the published precedence order is the gate order', () => {
  it('publishes every rank the gate applies, in the gate order and under its number', () => {
    expect(TOOL_APPROVAL_PRECEDENCE.map((row) => [row.rank, row.reason])).toEqual(
      TOOL_CALL_GATE_RANKS.map((rank) => [rank.rank, rank.reason]),
    );
  });

  it('leaves no rank of the gate without a published condition', () => {
    for (const row of TOOL_APPROVAL_PRECEDENCE) {
      expect(row.condition, `rank ${row.rank} (${row.reason})`).not.toBe('');
    }
  });

  it('publishes an outcome for every outcome the gate can reach', () => {
    for (const rank of TOOL_CALL_GATE_RANKS) {
      const published = TOOL_APPROVAL_PRECEDENCE.find((row) => row.rank === rank.rank);
      expect(published?.outcome, `rank ${rank.rank}`).toMatch(/^(Runs|Asks|Denied)/);
    }
    expect(new Set(TOOL_CALL_GATE_RANKS.map((rank) => rank.outcome))).toEqual(
      new Set(['allow', 'ask', 'deny', 'escalate']),
    );
  });

  it('says an unattended escalation is denied, because the gate denies it', () => {
    const escalations = TOOL_APPROVAL_PRECEDENCE.filter(
      (row) => TOOL_CALL_GATE_RANKS[row.rank - 1]?.outcome === 'escalate',
    );
    expect(escalations.length).toBeGreaterThan(0);
    for (const row of escalations) expect(row.outcome).toMatch(/unattended/);
  });
});

describe('the published tool table is the platform tool table', () => {
  it('carries a row for every declared platform tool and no other', () => {
    expect(
      buildToolApprovalToolRows()
        .map((row) => row.name)
        .sort(),
    ).toEqual(Object.keys(PLATFORM_TOOL_METADATA).sort());
  });

  it('gives every declared tool a name and a description a reader can act on', () => {
    for (const row of buildToolApprovalToolRows()) {
      expect(row.label, row.name).not.toBe(row.name);
      expect(row.description.length, row.name).toBeGreaterThan(40);
    }
  });

  it('follows the approval predicate rather than a written-down verdict', () => {
    const scratch = {
      toolNames: ['write_file', 'web_search'],
      autoApproves: (policy: (typeof TOOL_APPROVAL_POLICIES)[number], name: string) =>
        name === 'write_file' ? policy !== 'ask_every_time' : false,
    };
    const rows = buildToolApprovalToolRows(scratch);

    expect(rows.find((row) => row.name === 'write_file')?.runsWithoutAsking).toEqual([
      'auto_approve_read_only',
      'autonomous',
    ]);
    expect(rows.find((row) => row.name === 'web_search')?.runsWithoutAsking).toEqual([]);
    expect(
      buildToolApprovalToolRows().find((row) => row.name === 'write_file')?.runsWithoutAsking,
    ).toEqual([]);
  });
});

describe('the published account defaults are the settings the product offers', () => {
  const rows = buildToolApprovalPolicyRows();

  it('lists every policy the settings surface offers, under the name settings gives it', () => {
    expect(rows.map((row) => row.policy)).toEqual([...TOOL_APPROVAL_POLICIES]);
    for (const row of rows) expect(row.label).toBe(toolApprovalPolicyOption(row.policy).label);
  });

  it('marks as the default the policy a new account actually gets', () => {
    expect(rows.filter((row) => row.isDefault).map((row) => row.policy)).toEqual([
      WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
    ]);
  });

  it('shows the built-ins the website default runs and still excludes irreversible writes', () => {
    const defaultRow = rows.find((row) => row.policy === WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY)!;
    expect(defaultRow.runsWithoutAsking).toContain('Web search');
    expect(defaultRow.runsWithoutAsking).toContain('Fetch a page');
    expect(defaultRow.runsWithoutAsking).not.toContain('Write a file');
    expect(policyAutoApprovesTool(WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY, 'web_search')).toBe(
      true,
    );
    expect(policyAutoApprovesTool(WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY, 'write_file')).toBe(
      false,
    );
  });

  it('names a tool in a policy sentence only where that policy runs it', () => {
    for (const row of rows) {
      const sentence = toolApprovalPolicySentence(row);
      for (const tool of buildToolApprovalToolRows()) {
        expect(sentence.includes(tool.label), `${row.policy} / ${tool.label}`).toBe(
          row.runsWithoutAsking.includes(tool.label),
        );
      }
    }
  });
});
