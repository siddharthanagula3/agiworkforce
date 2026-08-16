
const mockSecureFetch = jest.fn();
jest.mock('@/services/secureFetch', () => ({
  secureFetch: (input: unknown, init: unknown) => mockSecureFetch(input, init),
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { refresh: jest.fn().mockResolvedValue(undefined) },
}));

let mockAppMode: unknown = 'local';
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: {
    getState: () => ({ appMode: mockAppMode }),
  },
}));

import { guardedFetch, EgressBlockedError } from '@/lib/egressGuard';
import {
  labelMobileSession,
  mobileExecutionProfileFor,
} from '@/src/features/chat/utils/sessionLabeling';
import {
  getSessionKindDefaults,
  validateSessionInvariants,
  type AppSession,
} from '@agiworkforce/types';
import type { ConversationExecutionMode } from '@/src/features/chat/utils/conversationMode';

beforeEach(() => {
  mockSecureFetch.mockReset().mockResolvedValue(new Response('ok', { status: 200 }));
  mockAppMode = 'local';
});

describe('labelMobileSession', () => {
  it('labels local as mobile_local_chat, never sync-eligible', () => {
    const session = labelMobileSession({
      id: 'conv_1',
      ownerUserId: 'user_1',
      executionMode: 'local',
    });
    expect(session.kind).toBe('mobile_local_chat');
    expect(session.originSurface).toBe('mobile');
    expect(session.trustBoundary).toEqual({ privacyMode: 'local', providerMode: 'Local' });
    expect(session.storageScope).toBe('local_device');
    expect(session.syncPolicy.syncEligible).toBe(false);
  });

  it('labels cloud as cloud_chat, sync-eligible across synced surfaces', () => {
    const session = labelMobileSession({
      id: 'conv_2',
      ownerUserId: 'user_1',
      executionMode: 'cloud',
    });
    expect(session.kind).toBe('cloud_chat');
    expect(session.trustBoundary).toEqual({
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
    });
    expect(session.storageScope).toBe('synced_app_cloud');
    expect(session.syncPolicy.syncEligible).toBe(true);
  });

  it('carries an honestly-labeled placeholder capabilityDocument, not fabricated version data', () => {
    const session = labelMobileSession({
      id: 'conv_3',
      ownerUserId: 'user_1',
      executionMode: 'local',
    });
    expect(session.policySnapshot.capabilityDocument.sessionId).toBe('conv_3');
    expect(session.policySnapshot.capabilityDocument.version).toBe(
      'unversioned-pending-capability-handshake',
    );
  });

  it('mobile_local_chat is never a handoff source or target (no reviewed-transfer path shipped yet)', () => {
    const session = labelMobileSession({
      id: 'conv_4',
      ownerUserId: 'user_1',
      executionMode: 'local',
    });
    expect(session.handoff).toEqual({ canBeHandoffSource: false, canBeHandoffTarget: false });
  });
});

describe('labelMobileSession tracks getSessionKindDefaults (no hand-inlined drift)', () => {
  const cases: Array<{
    mode: ConversationExecutionMode;
    kind: Parameters<typeof getSessionKindDefaults>[0];
  }> = [
    { mode: 'local', kind: 'mobile_local_chat' },
    { mode: 'cloud', kind: 'cloud_chat' },
  ];

  it.each(cases)('$kind matches getSessionKindDefaults($kind)', ({ mode, kind }) => {
    const session = labelMobileSession({
      id: `drift_${kind}`,
      ownerUserId: 'user_1',
      executionMode: mode,
    });
    const defaults = getSessionKindDefaults(kind);
    expect(session.executionLocation).toBe(defaults.executionLocation);
    expect(session.executionAuthority).toBe(defaults.executionAuthority);
    expect(session.storageScope).toBe(defaults.storageScope);
    expect(session.syncPolicy.syncEligible).toBe(defaults.syncEligible);
    expect(session.hostRequirement).toEqual(defaults.hostRequirement);
    expect(session.trustBoundary).toEqual(defaults.trustBoundary);
  });
});

describe('mobileExecutionProfileFor', () => {
  it('resolves local to the on-device Local inference path, zero violations', () => {
    const profile = mobileExecutionProfileFor('local');
    expect(profile.toggle).toBe('local');
    expect(profile.inference.providerMode).toBe('Local');
    expect(profile.data.syncPolicy.syncEligible).toBe(false);
    expect(profile.tools.cloudExecutionAllowed).toBe(false);
  });

  it('resolves cloud to the managed gateway path, zero violations', () => {
    const profile = mobileExecutionProfileFor('cloud');
    expect(profile.toggle).toBe('cloud');
    expect(profile.inference.providerMode).toBe('ManagedGateway');
    expect(profile.data.syncPolicy.syncEligible).toBe(true);
  });
});

describe('AppSession invariants fire on a deliberately inconsistent fixture', () => {
  it('throws when a mobile session claims a trust boundary that does not agree with itself', () => {
    const valid: AppSession = labelMobileSession({
      id: 'conv_5',
      ownerUserId: 'user_1',
      executionMode: 'local',
    });
    const tampered = {
      ...valid,
      trustBoundary: { privacyMode: 'local', providerMode: 'ManagedGateway' },
    } as unknown as AppSession;
    expect(validateSessionInvariants(tampered).map((v) => v.code)).toContain(
      'trust-boundary-provider-mismatch',
    );
  });
});

describe('ExecutionProfile agreement with the REAL 4-layer egress enforcement (guardedFetch)', () => {
  const OUR_CLOUD_URL = 'https://agiworkforce.com/api/llm/v1/chat/completions';

  it('a local ExecutionProfile implies our-cloud egress is blocked — and guardedFetch actually blocks it', async () => {
    mockAppMode = 'local';
    const profile = mobileExecutionProfileFor('local');
    expect(profile.tools.cloudExecutionAllowed).toBe(false);
    await expect(guardedFetch(OUR_CLOUD_URL)).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('a cloud ExecutionProfile implies our-cloud egress is allowed — and guardedFetch actually allows it', async () => {
    mockAppMode = 'cloud';
    const profile = mobileExecutionProfileFor('cloud');
    expect(profile.tools.cloudExecutionAllowed).toBe(true);
    await guardedFetch(OUR_CLOUD_URL);
    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
  });

  it('agreement holds for every reachable ConversationExecutionMode value', async () => {
    const modes: ConversationExecutionMode[] = ['local', 'cloud'];
    for (const mode of modes) {
      mockSecureFetch.mockClear();
      mockAppMode = mode;
      const profile = mobileExecutionProfileFor(mode);
      const expectBlocked = !profile.tools.cloudExecutionAllowed;
      if (expectBlocked) {
        await expect(guardedFetch(OUR_CLOUD_URL)).rejects.toBeInstanceOf(EgressBlockedError);
        expect(mockSecureFetch).not.toHaveBeenCalled();
      } else {
        await guardedFetch(OUR_CLOUD_URL);
        expect(mockSecureFetch).toHaveBeenCalledTimes(1);
      }
    }
  });
});
