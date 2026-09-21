import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
import {
  PLATFORM_TOOL_METADATA,
  policyAutoApprovesTool,
  resolveToolMetadata,
} from '../tool-metadata';
import { classifyToolLoopInputs } from '../tool-loop-routing';
import { TOOL_CALL_GATE_RANKS, TOOL_CALL_GATE_REASONS } from '../tool-call-gate';

const REPO = resolve(process.cwd(), '../..');
const SECURITY_DOC = resolve(REPO, 'docs/security/security.md');

function documentSection(heading: string): string {
  const source = readFileSync(SECURITY_DOC, 'utf8');
  const start = source.indexOf(heading);
  if (start < 0) throw new Error(`docs/security/security.md no longer has "${heading}"`);
  const rest = source.slice(start + heading.length);
  const next = rest.search(/\n#{2,4} /);
  return next < 0 ? rest : rest.slice(0, next);
}

function tableRows(section: string, firstColumn: RegExp): string[][] {
  return section
    .split('\n')
    .filter((line) => line.startsWith('|') && firstColumn.test(line))
    .map((line) =>
      line
        .slice(1, line.lastIndexOf('|'))
        .split('|')
        .map((cell) => cell.trim()),
    );
}

function metadataTokens(name: string): string {
  const metadata = resolveToolMetadata(name);
  const tokens = [metadata.actionClass, metadata.reversible ? 'reversible' : 'not reversible'];
  if (metadata.acceptsUntrustedContent) tokens.push('acceptsUntrustedContent');
  if (metadata.createsEgressPath) tokens.push('createsEgressPath');
  if (metadata.autoInReadOnlyMode === true) tokens.push('autoInReadOnlyMode');
  return tokens.join(', ');
}

function verdict(policy: ToolApprovalPolicy, name: string): string {
  return policyAutoApprovesTool(policy, name) ? 'runs' : 'asks';
}

describe('the approval posture section 1.1 publishes', () => {
  const section = documentSection('### 1.1 Managed Cloud, default tool authority');

  it('lists exactly the tools the platform declares metadata for', () => {
    const documented = tableRows(section, /^\| `[a-z_]+`\s*\|/).map((cells) =>
      cells[0]!.replace(/`/g, ''),
    );
    expect(documented.length).toBeGreaterThan(5);
    expect([...documented].sort()).toEqual([...Object.keys(PLATFORM_TOOL_METADATA)].sort());
  });

  it('gives each tool the answer the policy function gives', () => {
    const mismatches: string[] = [];
    for (const cells of tableRows(section, /^\| `[a-z_]+`\s*\|/)) {
      const name = cells[0]!.replace(/`/g, '');
      const expected = [
        verdict('ask_every_time', name),
        verdict('auto_approve_read_only', name),
        metadataTokens(name),
      ];
      const actual = [cells[1], cells[2], cells[3]];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(
          `${name}: document says ${actual.join(' / ')}, code says ${expected.join(' / ')}`,
        );
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });

  it('names every machine reason the gate can return, and no others', () => {
    const documented = new Set(
      tableRows(section, /^\| \d+\s*\|/).map((cells) => cells[3]!.replace(/`/g, '')),
    );
    expect([...documented].sort()).toEqual([...TOOL_CALL_GATE_REASONS].sort());
  });

  it('publishes one row per gate rank, in the order the gate applies them', () => {
    const rows = tableRows(section, /^\| \d+\s*\|/);
    expect(rows.map((cells) => Number(cells[0]))).toEqual(
      TOOL_CALL_GATE_RANKS.map((rank) => rank.rank),
    );
    expect(rows.map((cells) => cells[3]!.replace(/`/g, ''))).toEqual(
      TOOL_CALL_GATE_RANKS.map((rank) => rank.reason),
    );
  });
});

describe('the default account asks before every tool call', () => {
  it('ships ask_every_time as the default policy', () => {
    expect(DEFAULT_TOOL_APPROVAL_POLICY).toBe('ask_every_time');
  });

  it('auto-approves nothing under the default policy', () => {
    for (const name of Object.keys(PLATFORM_TOOL_METADATA)) {
      expect(policyAutoApprovesTool(DEFAULT_TOOL_APPROVAL_POLICY, name)).toBe(false);
    }
  });

  it('puts a turn that offers only a built-in tool into manual mode', () => {
    const tools = [{ type: 'function', function: { name: 'web_search' } }];
    expect(classifyToolLoopInputs([], tools, DEFAULT_TOOL_APPROVAL_POLICY).approvalMode).toBe(
      'manual',
    );
    expect(classifyToolLoopInputs([], tools, 'auto_approve_read_only').approvalMode).toBe('auto');
  });

  it('keeps an undeclared tool asking under every policy', () => {
    for (const policy of ['ask_every_time', 'auto_approve_read_only', 'autonomous'] as const) {
      expect(policyAutoApprovesTool(policy, 'mcp__vendor__undeclared_tool')).toBe(false);
    }
  });

  it('reads a declared GitHub built-in without asking, and never a sending one', () => {
    expect(
      policyAutoApprovesTool('auto_approve_read_only', 'mcp__github__get_pull_request_diff'),
    ).toBe(true);
    for (const name of ['post_issue_comment', 'post_pull_request_review']) {
      for (const policy of ['ask_every_time', 'auto_approve_read_only', 'autonomous'] as const) {
        expect(policyAutoApprovesTool(policy, `mcp__github__${name}`)).toBe(false);
      }
    }
  });
});
