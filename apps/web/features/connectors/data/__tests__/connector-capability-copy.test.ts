import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_CAPABILITIES,
  allowsPresentTenseCopy,
  getConnectorActionSource,
  getConnectorCapability,
  getDeclaredConnectorActions,
  isDeviceLocalConnector,
  isKnownConnectorId,
  resolveConnectorHealth,
} from '@/lib/connectors/catalog';

import {
  ACTION_SOURCE_COPY,
  CONNECTORS,
  RISK_CLASS_COPY,
  buildConnectorDescription,
  describeConnectorActions,
  getConnectorAvailability,
  type Connector,
} from '../connectors';

const PRESENT_TENSE_OPENERS = new Set([
  'access',
  'acknowledge',
  'connect',
  'control',
  'create',
  'crud',
  'execute',
  'fetch',
  'generate',
  'get',
  'index',
  'list',
  'log',
  'manage',
  'ocr',
  'post',
  'query',
  'read',
  'route',
  'run',
  'schedule',
  'search',
  'send',
  'set',
  'sync',
  'track',
  'trigger',
  'update',
  'upload',
  'write',
]);

function firstWord(sentence: string): string {
  return (sentence.split(/[\s,.]+/)[0] ?? '').toLowerCase();
}

function toSeed(connector: Connector) {
  const {
    description: _description,
    riskClass: _riskClass,
    actionCount: _actionCount,
    ...seed
  } = connector;
  return seed;
}

describe('CRIT-001 guard — one recorded resolution per connector', () => {
  it('gives every catalog entry a canonical capability record', () => {
    const unregistered = CONNECTORS.filter((c) => !isKnownConnectorId(c.id)).map((c) => c.id);
    expect(unregistered).toEqual([]);
  });

  it('does not keep a capability record for a connector nobody ships', () => {
    const catalogIds = new Set(CONNECTORS.map((c) => c.id));
    const orphans = Object.keys(CONNECTOR_CAPABILITIES).filter((id) => !catalogIds.has(id));
    expect(orphans).toEqual([]);
  });

  it('claims a shipped adapter for exactly the connectors that have one', () => {
    const firstParty = Object.values(CONNECTOR_CAPABILITIES)
      .filter((r) => r.implementation === 'first-party')
      .map((r) => r.id);
    expect(firstParty).toEqual(['github']);
  });

  it('lists named actions only where an adapter exists', () => {
    const claimingActions = Object.values(CONNECTOR_CAPABILITIES)
      .filter((r) => r.supportedActions.length > 0 && r.implementation !== 'first-party')
      .map((r) => r.id);
    expect(claimingActions).toEqual([]);
    expect(getConnectorCapability('github')?.supportedActions).toEqual([
      'get_pull_request_diff',
      'post_issue_comment',
      'post_pull_request_review',
    ]);
  });

  it('declares scopes only when this repository actually knows them', () => {
    const inventedScopes = Object.values(CONNECTOR_CAPABILITIES)
      .filter((r) => r.scopes.length > 0 && r.scopeSource !== 'first-party')
      .map((r) => r.id);
    expect(inventedScopes).toEqual([]);
  });

  it('keeps device-local connectors off the cloud surface entirely', () => {
    for (const record of Object.values(CONNECTOR_CAPABILITIES)) {
      if (record.implementation !== 'device-local') continue;
      expect(record.surfaces).not.toContain('cloud-web');
      expect(record.releaseState).toBe('desktop-only');
      expect(isDeviceLocalConnector(record.id)).toBe(true);
    }
  });

  it('never reports a connector as generally available while none is', () => {
    const generallyAvailable = Object.values(CONNECTOR_CAPABILITIES)
      .filter((r) => r.releaseState === 'generally-available')
      .map((r) => r.id);
    expect(generallyAvailable).toEqual([]);
  });
});

describe('CRIT-001 guard — present-tense copy requires a shipped adapter', () => {
  it('rejects a present-tense capability claim for anything unbuilt', () => {
    const offenders = CONNECTORS.filter(
      (c) => !allowsPresentTenseCopy(c.id) && PRESENT_TENSE_OPENERS.has(firstWord(c.description)),
    ).map((c) => `${c.id}: ${c.description}`);
    expect(offenders).toEqual([]);
  });

  it('generates every description, so none can be hand-written back in', () => {
    const handWritten = CONNECTORS.filter(
      (c) => c.description !== buildConnectorDescription(toSeed(c)),
    ).map((c) => c.id);
    expect(handWritten).toEqual([]);
  });

  it('says plainly that an unbuilt connector is not available by default', () => {
    const gmail = CONNECTORS.find((c) => c.id === 'gmail');
    expect(gmail?.description).toBe(
      'Not available by default. An operator can connect Gmail for email search, reading, sending, and drafts.',
    );
  });

  it('keeps the one true present-tense sentence for the one shipped adapter', () => {
    const github = CONNECTORS.find((c) => c.id === 'github');
    expect(github?.description).toBe(
      'Read PR diffs, comment on issues and PRs, and post PR reviews via the GitHub App.',
    );
  });

  it('names the owning surface before the capability for a device-local connector', () => {
    const terminal = CONNECTORS.find((c) => c.id === 'terminal');
    expect(terminal?.description).toBe(
      'Desktop Local only — command execution, scripts, and process management.',
    );
  });

  it('falls to the most restrictive copy for a connector nobody registered', () => {
    expect(
      buildConnectorDescription({
        id: 'not-registered-anywhere',
        name: 'Nowhere',
        capabilitySummary: 'everything you could want',
        category: 'Productivity',
        authType: 'oauth',
        phase: 1,
        iconBg: '',
        iconText: 'N',
      }),
    ).toBe(
      'Not available by default. An operator can connect Nowhere for everything you could want.',
    );
  });
});

describe('CRIT-001 guard — availability and health fail closed', () => {
  const gmail = CONNECTORS.find((c) => c.id === 'gmail')!;

  it('does not call a connector ready without a server answer', () => {
    expect(getConnectorAvailability(gmail, undefined)).toBe('unavailable');
    for (const connector of CONNECTORS) {
      expect(getConnectorAvailability(connector, undefined)).not.toBe('ready');
    }
  });

  it('only calls a connector ready while the server lists it', () => {
    expect(getConnectorAvailability(gmail, new Set(['gmail']))).toBe('ready');
    expect(getConnectorAvailability(gmail, new Set<string>())).toBe('unavailable');
  });

  it('treats an unknown connector id with no runtime evidence as not configured', () => {
    expect(resolveConnectorHealth({ connectorId: 'never-heard-of-it' })).toBe('not-configured');
    expect(resolveConnectorHealth({ connectorId: 'never-heard-of-it', available: true })).toBe(
      'connectable',
    );
  });

  it('reports a device-local connector as unsupported on this surface', () => {
    expect(
      resolveConnectorHealth({ connectorId: 'terminal', available: true, connected: true }),
    ).toBe('unsupported-here');
  });

  it('reports a dead grant as needing reauthorization before anything else', () => {
    expect(
      resolveConnectorHealth({
        connectorId: 'gmail',
        available: true,
        connected: true,
        needsReauthorization: true,
      }),
    ).toBe('needs-reauthorization');
  });

  it('separates connectable from connected from not configured', () => {
    expect(resolveConnectorHealth({ connectorId: 'gmail', available: true })).toBe('connectable');
    expect(resolveConnectorHealth({ connectorId: 'gmail', available: true, connected: true })).toBe(
      'connected',
    );
    expect(resolveConnectorHealth({ connectorId: 'gmail' })).toBe('not-configured');
  });
});

describe('CRIT-001 guard — an absent action list is attributed, not read as "none"', () => {
  it("records where every connector's actions come from", () => {
    const tally = Object.values(CONNECTOR_CAPABILITIES).reduce<Record<string, string[]>>(
      (acc, record) => {
        (acc[record.actionSource] ??= []).push(record.id);
        return acc;
      },
      {},
    );
    expect(tally['declared']).toEqual(['github']);
    expect(tally['runtime-discovered']?.length).toBe(83);
    expect(tally['device-local']?.length).toBe(5);
  });

  it('keeps an action list only where the source is this repository', () => {
    for (const record of Object.values(CONNECTOR_CAPABILITIES)) {
      if (record.actionSource === 'declared') {
        expect(record.supportedActions.length).toBeGreaterThan(0);
        expect(record.implementation).toBe('first-party');
      } else {
        expect(record.supportedActions).toEqual([]);
      }
      if (record.implementation === 'device-local') {
        expect(record.actionSource).toBe('device-local');
      }
    }
  });

  it('fails closed to runtime discovery for a connector nobody registered', () => {
    expect(getConnectorActionSource('never-heard-of-it')).toBe('runtime-discovered');
    expect(getDeclaredConnectorActions('never-heard-of-it')).toEqual([]);
    expect(describeConnectorActions('never-heard-of-it')).toBe(
      ACTION_SOURCE_COPY['runtime-discovered'],
    );
  });

  it('derives actionCount from the capability record instead of hand-writing it', () => {
    const handWritten = CONNECTORS.filter(
      (c) => c.actionCount !== getDeclaredConnectorActions(c.id).length,
    ).map((c) => c.id);
    expect(handWritten).toEqual([]);
    expect(CONNECTORS.find((c) => c.id === 'github')?.actionCount).toBe(3);
    expect(CONNECTORS.filter((c) => c.actionCount > 0).map((c) => c.id)).toEqual(['github']);
  });
});

describe('CRIT-001 guard — pre-consent copy promises nothing the tool loop skips', () => {
  // `tool-loop.ts` resolveToolCallGate returns `auto_approval_mode` allow for any
  // connector tool with no saved permission row, and every scheduled agent run
  // uses `approvalMode: 'auto'` (scheduled-agent-executor.ts). No catalog string
  // may therefore promise an approval prompt.
  const APPROVAL_PROMISES = [
    /approve[sd]? each tool/i,
    /needs your approval/i,
    /requires? (?:your )?approval/i,
    /before an agent can run/i,
    /you approve/i,
  ];

  const ALL_COPY = [...Object.values(RISK_CLASS_COPY), ...Object.values(ACTION_SOURCE_COPY)];

  it('never claims a tool is approved before it runs', () => {
    const offenders = ALL_COPY.filter((sentence) =>
      APPROVAL_PROMISES.some((pattern) => pattern.test(sentence)),
    );
    expect(offenders).toEqual([]);
  });

  it('opens no capability claim in the present tense', () => {
    const offenders = ALL_COPY.filter((sentence) => PRESENT_TENSE_OPENERS.has(firstWord(sentence)));
    expect(offenders).toEqual([]);
  });

  it('says an absent list means undiscovered, not empty', () => {
    expect(ACTION_SOURCE_COPY['runtime-discovered']).toContain('discovered when you connect');
    expect(ACTION_SOURCE_COPY['device-local']).toContain('your own machine');
    expect(describeConnectorActions('gmail')).toBe(ACTION_SOURCE_COPY['runtime-discovered']);
    expect(describeConnectorActions('terminal')).toBe(ACTION_SOURCE_COPY['device-local']);
    expect(describeConnectorActions('github')).toBe(ACTION_SOURCE_COPY['declared']);
  });
});
