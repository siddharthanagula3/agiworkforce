import { describe, expect, it } from 'vitest';
import { DEVELOPER_SESSION_PROTOCOL_VERSION } from '@agiworkforce/types';
import type { DeveloperSessionHandoff } from '@agiworkforce/types/protocol';
import {
  HANDOFF_MAX_AGE_MS,
  admitDeveloperSessionHandoff,
  describeHandoffRefusal,
  handoffReceipt,
  type HandoffAdmissionContext,
  type HandoffAdmissionRefusal,
} from '../integrations/developerSessionHandoff';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const CWD = '/Users/ada/work/repo';

function handoff(overrides: Partial<DeveloperSessionHandoff> = {}): DeveloperSessionHandoff {
  return {
    protocolVersion: DEVELOPER_SESSION_PROTOCOL_VERSION,
    threadId: 'thread-1',
    origin: 'developer_session',
    issuedBy: 'cli',
    issuedAt: new Date(NOW - 60_000).toISOString(),
    fromEnvironment: 'local',
    toEnvironment: 'local',
    workspace: { cwd: CWD, branch: 'feature/one' },
    posture: { agentMode: 'agent', trustMode: 'local', permissionProfileId: 'default' },
    ...overrides,
  } as DeveloperSessionHandoff;
}

function context(overrides: Partial<HandoffAdmissionContext> = {}): HandoffAdmissionContext {
  return {
    supportedProtocolVersions: [DEVELOPER_SESSION_PROTOCOL_VERSION],
    nowMs: NOW,
    workspaceCwd: CWD,
    accepted: new Set<string>(),
    ...overrides,
  };
}

function refusalOf(
  record: DeveloperSessionHandoff,
  ctx: HandoffAdmissionContext,
): HandoffAdmissionRefusal {
  const outcome = admitDeveloperSessionHandoff(record, ctx);
  if (outcome.status !== 'refused') throw new Error('the record was admitted');
  return outcome.refusal;
}

describe('taking over the session the CLI was running', () => {
  it('resumes the same thread rather than starting a new one', () => {
    const outcome = admitDeveloperSessionHandoff(handoff(), context());

    expect(outcome).toMatchObject({
      status: 'admitted',
      admission: { start: { kind: 'resume', threadId: 'thread-1' } },
    });
  });

  it('seeds a new thread when the work came from a chat rather than a session', () => {
    const outcome = admitDeveloperSessionHandoff(handoff({ origin: 'chat' }), context());

    expect(outcome).toMatchObject({
      admission: { start: { kind: 'seed', seededFromThreadId: 'thread-1' } },
    });
  });

  it('restarts the local resources itself and inherits no approval', () => {
    const outcome = admitDeveloperSessionHandoff(
      handoff({
        localResources: ['dev_server', 'mcp_server'],
        lastTurn: {
          turnId: 'turn-9',
          state: 'interrupted',
          endedAt: new Date(NOW - 90_000).toISOString(),
        },
      }),
      context(),
    );

    expect(outcome).toMatchObject({
      admission: { restart: ['dev_server', 'mcp_server'], interruptedTurn: 'turn-9' },
    });
  });

  it('leaves a finished turn alone', () => {
    const outcome = admitDeveloperSessionHandoff(
      handoff({
        lastTurn: {
          turnId: 'turn-9',
          state: 'completed',
          endedAt: new Date(NOW - 90_000).toISOString(),
        },
      }),
      context(),
    );

    expect(outcome.status === 'admitted' && outcome.admission.interruptedTurn).toBeUndefined();
  });
});

describe('the records this editor will not take', () => {
  it('refuses a record that speaks a protocol this build does not', () => {
    expect(
      refusalOf(handoff({ protocolVersion: DEVELOPER_SESSION_PROTOCOL_VERSION + 4 }), context()),
    ).toMatchObject({ reason: 'protocolVersionUnsupported' });
  });

  it('refuses a record addressed to the cloud', () => {
    expect(refusalOf(handoff({ toEnvironment: 'cloud' }), context())).toMatchObject({
      reason: 'wrongDestination',
    });
  });

  it('refuses a session that never established a trust boundary', () => {
    const record = handoff();
    record.posture = { ...record.posture, trustMode: 'unknown' };
    expect(refusalOf(record, context())).toEqual({ reason: 'trustModeUnknown' });
  });

  it('refuses a record older than the window, and one dated in the future', () => {
    expect(
      refusalOf(
        handoff({ issuedAt: new Date(NOW - HANDOFF_MAX_AGE_MS - 1_000).toISOString() }),
        context(),
      ),
    ).toMatchObject({ reason: 'expired' });
    expect(
      refusalOf(
        handoff({ issuedAt: new Date(NOW + HANDOFF_MAX_AGE_MS + 1_000).toISOString() }),
        context(),
      ),
    ).toEqual({ reason: 'notYetIssued' });
    expect(refusalOf(handoff({ issuedAt: 'whenever' }), context())).toMatchObject({
      reason: 'issuedAtUnreadable',
    });
  });

  it('refuses the same record a second time', () => {
    const record = handoff();
    const first = admitDeveloperSessionHandoff(record, context());
    if (first.status !== 'admitted') throw new Error('the first offer should be admitted');

    expect(refusalOf(record, context({ accepted: new Set([first.receipt]) }))).toEqual({
      reason: 'alreadyAccepted',
    });
    expect(first.receipt).toBe(handoffReceipt(record));
  });

  it('refuses a record produced under a different account', () => {
    expect(
      refusalOf(
        handoff(),
        context({ editorAccountId: 'user_ada', runtimeAccountId: 'user_grace' }),
      ),
    ).toMatchObject({ reason: 'wrongAccount' });
    expect(
      admitDeveloperSessionHandoff(
        handoff(),
        context({ editorAccountId: 'user_ada', runtimeAccountId: 'user_ada' }),
      ).status,
    ).toBe('admitted');
  });

  it('refuses a record for a checkout this window does not have open', () => {
    expect(refusalOf(handoff(), context({ workspaceCwd: '/Users/ada/work/other' }))).toMatchObject({
      reason: 'wrongWorkspace',
    });
  });

  it('refuses a record carrying something that looks like a credential', () => {
    expect(
      refusalOf(handoff({ objective: 'deploy with sk-abcdefghijklmnopqrstuvwx' }), context()),
    ).toEqual({ reason: 'credentialInRecord', field: 'objective' });
    expect(
      refusalOf(
        handoff({
          validations: [
            {
              command: 'curl -H "Authorization: ghp_abcdefghijklmnopqrstuvwxyz01"',
              outcome: 'passed',
              ranAt: new Date(NOW).toISOString(),
            },
          ],
        }),
        context(),
      ),
    ).toEqual({ reason: 'credentialInRecord', field: 'validations' });
  });

  it('says what happened in words a user can act on, for every refusal', () => {
    const refusals: HandoffAdmissionRefusal[] = [
      { reason: 'protocolVersionUnsupported', requested: 99, supported: [8] },
      { reason: 'wrongDestination', expected: 'local', received: 'cloud' },
      { reason: 'trustModeUnknown' },
      { reason: 'issuedAtUnreadable', issuedAt: 'whenever' },
      { reason: 'expired', ageMs: 3_600_000, maxAgeMs: HANDOFF_MAX_AGE_MS },
      { reason: 'notYetIssued' },
      { reason: 'alreadyAccepted' },
      { reason: 'wrongAccount', expected: 'user_ada', received: 'user_grace' },
      { reason: 'wrongWorkspace', expected: CWD, received: '/elsewhere' },
      { reason: 'credentialInRecord', field: 'objective' },
    ];

    for (const refusal of refusals) {
      const message = describeHandoffRefusal(refusal);
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toContain('undefined');
    }
  });
});
