import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEVICE_STEP_TOOLS, isDeviceStepTool } from '@agiworkforce/local-runtime-contract';
import { BROWSER_COMMANDS } from '@agiworkforce/types';
import { TOOL_APPROVAL_POLICIES, type ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';
import {
  PLATFORM_TOOL_METADATA,
  resolveToolMetadata,
  toolCreatesEgressPath,
} from './tool-metadata';
import type { ConnectorToolPermissionLevel } from './connector-tool-permissions';
import {
  batchIntroducesUntrustedContent,
  resolveToolCallGate,
  sensitiveSourceReachable,
  TOOL_CALL_GATE_RANKS,
  TOOL_CALL_GATE_REASONS,
  untrustedToolContentInContext,
  type ToolCallGate,
  type ToolCallGateContext,
  type ToolCallGateRequest,
} from './tool-call-gate';

const SECURITY_DOC = resolve(process.cwd(), '../..', 'docs/security/security.md');

interface PublishedRank {
  rank: number;
  verdict: 'allow' | 'ask' | 'deny';
  unattendedVerdict: 'allow' | 'ask' | 'deny';
  reason: string;
}

/**
 * The expected outcomes come from the published precedence table, not from the
 * module under test, so a code change that the document does not make fails.
 */
function publishedPrecedence(): PublishedRank[] {
  const source = readFileSync(SECURITY_DOC, 'utf8');
  const heading = '### 1.1 Managed Cloud, default tool authority';
  const start = source.indexOf(heading);
  if (start < 0) throw new Error('docs/security/security.md no longer has section 1.1');
  const rest = source.slice(start + heading.length);
  const next = rest.search(/\n#{2,4} /);
  const section = next < 0 ? rest : rest.slice(0, next);
  const rows = section
    .split('\n')
    .filter((line) => /^\| \d+\s*\|/.test(line))
    .map((line) =>
      line
        .slice(1, line.lastIndexOf('|'))
        .split('|')
        .map((cell) => cell.trim()),
    );
  return rows.map((cells) => {
    const published = cells[2] ?? '';
    const escalates = /deny when unattended/.test(published);
    const attended = published.split(',')[0]!.trim();
    if (attended !== 'allow' && attended !== 'ask' && attended !== 'deny') {
      throw new Error(`section 1.1 publishes an unreadable verdict "${published}"`);
    }
    return {
      rank: Number(cells[0]),
      verdict: attended,
      unattendedVerdict: escalates ? 'deny' : attended,
      reason: (cells[3] ?? '').replace(/`/g, ''),
    };
  });
}

const PUBLISHED = publishedPrecedence();

const UNDECLARED_CONNECTOR_TOOL = 'mcp__fixtureserver__mutate_fixture_record';
const DECLARED_CONNECTOR_READ = 'mcp__github__get_pull_request_diff';
const DECLARED_CONNECTOR_SEND = 'mcp__github__post_issue_comment';

const TOOL_CORPUS: readonly string[] = [
  ...Object.keys(PLATFORM_TOOL_METADATA),
  ...DEVICE_STEP_TOOLS,
  ...BROWSER_COMMANDS,
  DECLARED_CONNECTOR_READ,
  DECLARED_CONNECTOR_SEND,
  UNDECLARED_CONNECTOR_TOOL,
];

type ToolClass = 'read_only' | 'mutating' | 'exfiltrating';

function toolClass(name: string): ToolClass {
  const metadata = resolveToolMetadata(name);
  if (metadata.createsEgressPath) return 'exfiltrating';
  return metadata.actionClass === 'read' ? 'read_only' : 'mutating';
}

const SAVED_LEVELS: readonly (ConnectorToolPermissionLevel | undefined)[] = [
  undefined,
  'allow',
  'ask',
  'deny',
];

interface Combination {
  request: ToolCallGateRequest;
  context: ToolCallGateContext;
}

function everyCombination(): Combination[] {
  const combinations: Combination[] = [];
  for (const qualifiedName of TOOL_CORPUS) {
    for (const savedLevel of SAVED_LEVELS) {
      for (const toolApprovalPolicy of TOOL_APPROVAL_POLICIES) {
        for (const approvalMode of ['auto', 'manual'] as const) {
          for (const unattended of [false, true]) {
            for (const untrustedContentInContext of [false, true]) {
              for (const batchUntrusted of [false, true]) {
                for (const sensitiveSourceAvailable of [false, true]) {
                  for (const deviceHostPresent of [false, true]) {
                    combinations.push({
                      request: {
                        qualifiedName,
                        savedLevel,
                        batchIntroducesUntrustedContent: batchUntrusted,
                      },
                      context: {
                        approvalMode,
                        toolApprovalPolicy,
                        unattended,
                        deviceHostPresent,
                        untrustedContentInContext,
                        sensitiveSourceAvailable,
                      },
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return combinations;
}

const COMBINATIONS = everyCombination();

function trifectaHolds(combination: Combination): boolean {
  return (
    (combination.context.untrustedContentInContext ||
      combination.request.batchIntroducesUntrustedContent) &&
    combination.context.sensitiveSourceAvailable &&
    toolCreatesEgressPath(combination.request.qualifiedName)
  );
}

function gateOf(combination: Combination): ToolCallGate {
  return resolveToolCallGate(combination.request, combination.context);
}

function describeCase(combination: Combination): string {
  const { request, context } = combination;
  return [
    request.qualifiedName,
    `saved=${request.savedLevel ?? 'none'}`,
    context.toolApprovalPolicy,
    `mode=${context.approvalMode}`,
    context.unattended ? 'unattended' : 'attended',
    `U=${context.untrustedContentInContext || request.batchIntroducesUntrustedContent}`,
    `S=${context.sensitiveSourceAvailable}`,
    `device=${context.deviceHostPresent}`,
  ].join(' ');
}

describe('the gate table is the published precedence table', () => {
  it('publishes one row per rank, in order', () => {
    expect(PUBLISHED.map((row) => row.rank)).toEqual(TOOL_CALL_GATE_RANKS.map((rank) => rank.rank));
    expect(PUBLISHED.map((row) => row.reason)).toEqual(
      TOOL_CALL_GATE_RANKS.map((rank) => rank.reason),
    );
  });

  it('declares every reason the ranks can return and no others', () => {
    expect([...new Set(TOOL_CALL_GATE_RANKS.map((rank) => rank.reason))].sort()).toEqual(
      [...TOOL_CALL_GATE_REASONS].sort(),
    );
  });

  it('ends in a rank that always applies, so every call gets a verdict', () => {
    const last = TOOL_CALL_GATE_RANKS[TOOL_CALL_GATE_RANKS.length - 1]!;
    expect(
      last.applies({
        qualifiedName: 'anything',
        savedLevel: undefined,
        batchIntroducesUntrustedContent: false,
        approvalMode: 'auto',
        toolApprovalPolicy: 'ask_every_time',
        unattended: false,
        deviceHostPresent: false,
        untrustedContentInContext: false,
        sensitiveSourceAvailable: false,
        trifecta: false,
      }),
    ).toBe(true);
  });
});

describe('every combination of policy, tool class, attendance and context legs', () => {
  it('covers all three tool classes and every approval policy', () => {
    const classes = new Set(TOOL_CORPUS.map(toolClass));
    expect([...classes].sort()).toEqual(['exfiltrating', 'mutating', 'read_only']);
    expect(COMBINATIONS.length).toBe(TOOL_CORPUS.length * 4 * TOOL_APPROVAL_POLICIES.length * 64);
  });

  it('reaches every rank in the table, so no rank is dead', () => {
    const reached = new Set(COMBINATIONS.map((combination) => gateOf(combination).rank));
    expect([...reached].sort((a, b) => a - b)).toEqual(
      TOOL_CALL_GATE_RANKS.map((rank) => rank.rank),
    );
  });

  it('gives each call the verdict its rank publishes', () => {
    const mismatches: string[] = [];
    for (const combination of COMBINATIONS) {
      const gate = gateOf(combination);
      const published = PUBLISHED.find((row) => row.rank === gate.rank);
      if (!published) {
        mismatches.push(`${describeCase(combination)}: rank ${gate.rank} is not published`);
        continue;
      }
      const expected = combination.context.unattended
        ? published.unattendedVerdict
        : published.verdict;
      if (gate.verdict !== expected || gate.reason !== published.reason) {
        mismatches.push(
          `${describeCase(combination)}: gate says ${gate.verdict}/${gate.reason}, section 1.1 rank ${gate.rank} says ${expected}/${published.reason}`,
        );
      }
    }
    expect(mismatches.slice(0, 10), `${mismatches.length} mismatches`).toEqual([]);
  });

  it('applies the first rank whose condition holds and no later one', () => {
    const mismatches: string[] = [];
    for (const combination of COMBINATIONS) {
      const gate = gateOf(combination);
      const subject = {
        ...combination.context,
        ...combination.request,
        trifecta: trifectaHolds(combination),
      };
      const earlier = TOOL_CALL_GATE_RANKS.filter(
        (rank) => rank.rank < gate.rank && rank.applies(subject),
      );
      if (earlier.length > 0) {
        mismatches.push(
          `${describeCase(combination)}: decided at rank ${gate.rank} while rank ${earlier[0]!.rank} also applied`,
        );
      }
    }
    expect(mismatches.slice(0, 10), `${mismatches.length} out-of-order decisions`).toEqual([]);
  });

  it('never lets a saved deny be reversed by anything below it', () => {
    for (const combination of COMBINATIONS) {
      if (combination.request.savedLevel !== 'deny') continue;
      const gate = gateOf(combination);
      expect(gate.verdict, describeCase(combination)).toBe('deny');
      expect(gate.reason).toBe('blocked_by_user_permission');
    }
  });

  it('asks for every tool under the default policy when no verdict is saved', () => {
    for (const combination of COMBINATIONS) {
      const { request, context } = combination;
      if (request.savedLevel !== undefined) continue;
      if (context.toolApprovalPolicy !== 'ask_every_time') continue;
      if (context.approvalMode !== 'manual') continue;
      if (context.deviceHostPresent && isDeviceStepTool(request.qualifiedName)) continue;
      const gate = gateOf(combination);
      expect(gate.verdict, describeCase(combination)).not.toBe('allow');
    }
  });

  it('never escalates a tool that creates no egress path', () => {
    for (const combination of COMBINATIONS) {
      if (toolCreatesEgressPath(combination.request.qualifiedName)) continue;
      expect(gateOf(combination).reason, describeCase(combination)).not.toBe('lethal_trifecta');
    }
  });

  it('treats an undeclared connector tool as egress-bearing, so it can escalate', () => {
    expect(toolCreatesEgressPath(UNDECLARED_CONNECTOR_TOOL)).toBe(true);
    expect(resolveToolMetadata(UNDECLARED_CONNECTOR_TOOL).declared).toBe(false);
  });
});

describe('the lethal-trifecta escalation, and the three limits published for it', () => {
  it('raises U from tool-fetched content only, so pasted or attached content is not counted', () => {
    expect(untrustedToolContentInContext([])).toBe(false);
    expect(untrustedToolContentInContext(['create_folder', 'search_maps'])).toBe(false);
    expect(untrustedToolContentInContext(['url_fetch'])).toBe(true);
    expect(untrustedToolContentInContext(['web_search'])).toBe(true);

    // The one input that stands for pasted and attached content is the S leg,
    // and raising it alone never escalates.
    const attachmentOnly: Combination = {
      request: {
        qualifiedName: 'url_fetch',
        savedLevel: undefined,
        batchIntroducesUntrustedContent: false,
      },
      context: {
        approvalMode: 'auto',
        toolApprovalPolicy: 'autonomous',
        unattended: true,
        deviceHostPresent: false,
        untrustedContentInContext: false,
        sensitiveSourceAvailable: true,
      },
    };
    expect(gateOf(attachmentOnly)).toEqual({
      verdict: 'allow',
      reason: 'auto_approval_mode',
      rank: 9,
    });
    expect(
      sensitiveSourceReachable({
        privateContextPresent: true,
        offeredTools: [],
        availableToolNames: [],
      }),
    ).toBe(true);
  });

  it('gates auto-approval only: adding the escalation never loosens a verdict and never changes an ask or a deny', () => {
    const loosened: string[] = [];
    const changed: string[] = [];
    for (const combination of COMBINATIONS) {
      if (!trifectaHolds(combination)) continue;
      const without: Combination = {
        request: { ...combination.request, batchIntroducesUntrustedContent: false },
        context: { ...combination.context, untrustedContentInContext: false },
      };
      const before = gateOf(without);
      const after = gateOf(combination);
      const rankOf = { allow: 0, ask: 1, deny: 2 } as const;
      if (rankOf[after.verdict] < rankOf[before.verdict]) {
        loosened.push(`${describeCase(combination)}: ${before.verdict} became ${after.verdict}`);
      }
      if (before.verdict !== 'allow' && after.verdict !== before.verdict) {
        changed.push(`${describeCase(combination)}: ${before.verdict} became ${after.verdict}`);
      }
    }
    expect(loosened.slice(0, 10), `${loosened.length} loosened`).toEqual([]);
    expect(changed.slice(0, 10), `${changed.length} non-allow verdicts changed`).toEqual([]);
  });

  it('cannot stop a user who approves: attended, its strongest outcome is a prompt', () => {
    const attendedEscalations = COMBINATIONS.filter(
      (combination) =>
        !combination.context.unattended && gateOf(combination).reason === 'lethal_trifecta',
    );
    expect(attendedEscalations.length).toBeGreaterThan(0);
    for (const combination of attendedEscalations) {
      expect(gateOf(combination).verdict, describeCase(combination)).toBe('ask');
    }
  });

  it('denies rather than asks on an unattended run, because there is nobody to ask', () => {
    const unattendedEscalations = COMBINATIONS.filter(
      (combination) =>
        combination.context.unattended && gateOf(combination).reason === 'lethal_trifecta',
    );
    expect(unattendedEscalations.length).toBeGreaterThan(0);
    for (const combination of unattendedEscalations) {
      expect(gateOf(combination).verdict, describeCase(combination)).toBe('deny');
    }
  });

  it('derives S from the offered catalog rather than from what was read', () => {
    expect(
      sensitiveSourceReachable({
        privateContextPresent: false,
        offeredTools: [{ qualifiedName: UNDECLARED_CONNECTOR_TOOL, origin: 'connector' }],
        availableToolNames: [],
      }),
    ).toBe(true);
    expect(
      sensitiveSourceReachable({
        privateContextPresent: false,
        offeredTools: [],
        availableToolNames: Object.keys(PLATFORM_TOOL_METADATA),
      }),
    ).toBe(false);
  });

  it('counts a sibling in the same batch but never the call being gated', () => {
    const batch = [
      { id: 'a', qualifiedName: 'url_fetch' },
      { id: 'b', qualifiedName: 'mcp__github__post_issue_comment' },
    ];
    expect(batchIntroducesUntrustedContent('b', batch)).toBe(true);
    expect(batchIntroducesUntrustedContent('a', batch)).toBe(false);
  });
});

describe('the account policy decides only where the gate reaches it', () => {
  it('reaches the account policy only in manual mode with no saved verdict', () => {
    const reached = COMBINATIONS.filter(
      (combination) => gateOf(combination).reason === 'account_default_read_only',
    );
    expect(reached.length).toBeGreaterThan(0);
    for (const combination of reached) {
      expect(combination.context.approvalMode, describeCase(combination)).toBe('manual');
      expect(combination.request.savedLevel).toBeUndefined();
      expect(combination.context.toolApprovalPolicy).not.toBe('ask_every_time');
      expect(trifectaHolds(combination)).toBe(false);
    }
  });

  it('gives a policy the account cannot hold no way into the table', () => {
    const policies = new Set<ToolApprovalPolicy>(
      COMBINATIONS.map((combination) => combination.context.toolApprovalPolicy),
    );
    expect([...policies].sort()).toEqual([...TOOL_APPROVAL_POLICIES].sort());
  });
});

describe('a browser or computer-use action goes through the same gate', () => {
  it('gates every browser command kind, none of them silently', () => {
    for (const command of BROWSER_COMMANDS) {
      const gate = resolveToolCallGate(
        {
          qualifiedName: command,
          savedLevel: undefined,
          batchIntroducesUntrustedContent: false,
        },
        {
          approvalMode: 'manual',
          toolApprovalPolicy: 'autonomous',
          unattended: false,
          deviceHostPresent: true,
          untrustedContentInContext: false,
          sensitiveSourceAvailable: false,
        },
      );
      expect(gate.verdict, command).toBe('ask');
      expect(gate.reason, command).toBe('manual_approval_mode');
    }
  });

  it('refuses every browser command kind after a page has been read, unattended', () => {
    for (const command of BROWSER_COMMANDS) {
      const gate = resolveToolCallGate(
        { qualifiedName: command, savedLevel: 'allow', batchIntroducesUntrustedContent: false },
        {
          approvalMode: 'auto',
          toolApprovalPolicy: 'autonomous',
          unattended: true,
          deviceHostPresent: true,
          untrustedContentInContext: true,
          sensitiveSourceAvailable: true,
        },
      );
      expect(gate.verdict, command).toBe('deny');
      expect(gate.reason, command).toBe('lethal_trifecta');
    }
  });

  it('classifies every browser command as egress-bearing, so none of them slips the escalation', () => {
    for (const command of BROWSER_COMMANDS) {
      expect(toolCreatesEgressPath(command), command).toBe(true);
      expect(toolClass(command), command).toBe('exfiltrating');
    }
  });
});

describe('a device step on a desktop-hosted turn', () => {
  it('is allowed at its own rank, above the account policy and the escalation', () => {
    for (const tool of DEVICE_STEP_TOOLS) {
      const gate = resolveToolCallGate(
        {
          qualifiedName: tool,
          savedLevel: undefined,
          batchIntroducesUntrustedContent: true,
        },
        {
          approvalMode: 'manual',
          toolApprovalPolicy: 'ask_every_time',
          unattended: true,
          deviceHostPresent: true,
          untrustedContentInContext: true,
          sensitiveSourceAvailable: true,
        },
      );
      expect(gate, tool).toEqual({ verdict: 'allow', reason: 'auto_approval_mode', rank: 2 });
    }
  });

  it('is asked for like any other tool when the turn carries no device host', () => {
    for (const tool of DEVICE_STEP_TOOLS) {
      const gate = resolveToolCallGate(
        { qualifiedName: tool, savedLevel: undefined, batchIntroducesUntrustedContent: false },
        {
          approvalMode: 'manual',
          toolApprovalPolicy: 'autonomous',
          unattended: false,
          deviceHostPresent: false,
          untrustedContentInContext: false,
          sensitiveSourceAvailable: false,
        },
      );
      expect(gate.verdict, tool).toBe('ask');
      expect(gate.reason, tool).toBe('manual_approval_mode');
    }
  });
});
