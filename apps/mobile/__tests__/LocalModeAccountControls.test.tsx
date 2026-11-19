import React from 'react';
import { Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { requireAutoMode } from '../test-utils/modelFixtures';

const mockStored = new Map<string, unknown>();
jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => {
      const value = mockStored.get(key);
      return typeof value === 'string' ? value : undefined;
    },
    getBoolean: (key: string) => {
      const value = mockStored.get(key);
      return typeof value === 'boolean' ? value : undefined;
    },
    getNumber: (key: string) => {
      const value = mockStored.get(key);
      return typeof value === 'number' ? value : undefined;
    },
    contains: (key: string) => mockStored.has(key),
    set: (key: string, value: unknown) => {
      mockStored.set(key, value);
    },
    delete: (key: string) => {
      mockStored.delete(key);
    },
  },
  mmkvStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
  rehydrateWhenMmkvReady: () => undefined,
  whenMmkvReady: (callback: () => void) => callback(),
}));

type SentRequest = {
  method: string;
  path: string;
  search: string;
  body: unknown;
  authorization: string | undefined;
  stepUpToken: string | undefined;
};
const mockEvents: string[] = [];
const mockRequests: SentRequest[] = [];
let mockAnswer: (request: SentRequest) => { status: number; body: unknown } = () => ({
  status: 500,
  body: {},
});
jest.mock('@/services/secureFetch', () => ({
  secureFetch: async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const request: SentRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.search,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      authorization: headers.Authorization ?? headers.authorization,
      stepUpToken: headers['x-step-up-token'],
    };
    mockRequests.push(request);
    mockEvents.push(`${request.method} ${request.path}`);
    const { status, body } = mockAnswer(request);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
}));

jest.mock('@/services/authSession', () => ({
  getAuthToken: async () => 'fixture-session-jwt',
  getAuthHeaders: async () => ({ Authorization: 'Bearer fixture-session-jwt' }),
  refreshAuthSession: async () => false,
  clearAuthSession: async () => undefined,
  getCurrentUserId: async () => 'account-a',
}));

const mockSession = {
  id: 'session-a',
  user: { id: 'account-a' },
  getToken: async () => 'fixture-session-jwt',
};
jest.mock('@clerk/expo', () => ({
  getClerkInstance: () => ({ session: mockSession }),
  useSession: () => ({ session: mockSession }),
}));

const mockAuth = { isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'account-a' };
jest.mock('@/src/features/auth/store', () => {
  const useAuthStore = (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth);
  useAuthStore.getState = () => mockAuth;
  useAuthStore.subscribe = () => () => undefined;
  return { useAuthStore };
});

let mockSecondFactorPassed = false;
jest.mock('@/src/features/auth/components/StepUpModal', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    StepUpModal: ({
      challenge,
      onSatisfied,
    }: {
      challenge: import('@/src/features/auth/services/stepUp').StepUpChallenge;
      onSatisfied: (token: string) => void;
    }) => {
      useEffect(() => {
        mockSecondFactorPassed = true;
        const { requestStepUpGrant } = jest.requireActual<
          typeof import('@/src/features/auth/services/stepUp')
        >('@/src/features/auth/services/stepUp');
        void requestStepUpGrant(challenge.action, challenge.resourceId, 'fixture-session-jwt', {
          accountEpoch: challenge.identity.account,
          signal: challenge.signal,
        }).then((outcome) => {
          if (outcome.kind === 'granted') onSatisfied(outcome.token);
        });
      }, [challenge, onSatisfied]);
      return null;
    },
  };
});

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async (key: string) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockEvents.push(`remove ${key} from the keychain`);
  },
}));
jest.mock('@/lib/deviceId', () => ({ getDeviceId: async () => 'fixture-install' }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('@/services/dsarTemporaryFile', () => ({
  withDsarTemporaryFile: async (
    _name: string,
    _assertActive: () => void,
    work: (uri: string) => Promise<void>,
  ) => work('file:///cache/dsar_exports/export.json'),
}));
jest.mock('expo-file-system/legacy', () => ({
  ...jest.requireActual('expo-file-system/legacy'),
  writeAsStringAsync: jest.fn(async () => undefined),
}));
jest.mock('@/src/features/voice/hooks/useLiveVoiceSession', () => ({
  endLiveVoiceSessions: jest.fn(),
}));
jest.mock('@/src/shared/components/Toast', () => ({
  ...jest.requireActual('@/src/shared/components/Toast'),
  showToast: jest.fn(),
}));

import {
  AGENT_TASK_STATES,
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
  MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
  MANAGED_CLOUD_AGENT_RUNS_BASE_PATH,
  MANAGED_CLOUD_DATA_EXPORT_PATH,
  MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE,
  MANAGED_CLOUD_SCHEDULES_PATH,
  MOBILE_INTENT_TOKEN_PATH,
  parseAccountDeletionCancellationReceipt,
  parseAccountDeletionScheduleReceipt,
  parseAccountDeletionStatus,
} from '@agiworkforce/cloud-contracts';
import * as Sharing from 'expo-sharing';
import { EgressBlockedError, STEP_UP_PATH } from '@/lib/egressGuard';
import { api } from '@/services/api';
import { exportCloudUserData } from '@/services/cloudDataExport';
import {
  CLOUD_PROVIDER_CONSENT_KEY,
  CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY,
  hasCurrentCloudProviderConsent,
  recordCloudProviderConsent,
} from '@/services/providerConsent';
import { useStepUp, type UseStepUp } from '@/src/features/auth/hooks/useStepUp';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { requestStepUpGrant } from '@/src/features/auth/services/stepUp';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { installCloudModeDoor } from '@/src/features/chat/store/cloudModeDoor';
import {
  standingCloudWorkPausedMessage,
  withdrawSharingWithProviders,
} from '@/src/features/settings/cloud-privacy/CloudProviderSharingGroup';
import { ASK_INTENT_KEYCHAIN_KEY } from '@/src/features/siri/askIntentToken';
import { showToast } from '@/src/shared/components/Toast';

const AUTO_MODEL_ID = requireAutoMode().id;
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULED_FOR = '2026-12-17T12:00:00.000Z';
const REQUESTED_AT = '2026-11-17T12:00:00.000Z';
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const mockShowToast = showToast as jest.Mock;

function json(status: number, body: unknown) {
  return { status, body };
}

function account(): CloudAccountEpoch {
  const current = captureCloudAccountEpoch();
  if (!current) throw new Error('No Cloud account in this test');
  return current;
}

let stepUp: UseStepUp;
function StepUpHost() {
  stepUp = useStepUp();
  return stepUp.modal;
}

beforeEach(() => {
  mockStored.clear();
  mockEvents.length = 0;
  mockRequests.length = 0;
  mockSecondFactorPassed = false;
  alertSpy.mockClear();
  mockShowToast.mockClear();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useChatAppModeStore.setState({ appMode: 'local' });
});

describe('account controls in Local Mode, for an account that never allowed sharing', () => {
  let deletion: { pending: boolean } = { pending: false };

  beforeEach(() => {
    deletion = { pending: false };
    mockAnswer = (request) => {
      const route = `${request.method} ${request.path}`;
      if (route === `GET ${MANAGED_CLOUD_ACCOUNT_DELETION_PATH}`) {
        return json(
          200,
          deletion.pending
            ? {
                pending: true,
                canCancel: true,
                cancellationPrecondition: 'schedule-pair-v1',
                requestedAt: REQUESTED_AT,
                scheduledFor: SCHEDULED_FOR,
              }
            : { pending: false, canCancel: false, requestedAt: null, scheduledFor: null },
        );
      }
      if (route === `DELETE ${MANAGED_CLOUD_ACCOUNT_DELETION_PATH}`) {
        if (request.stepUpToken !== 'fixture-step-up-grant') {
          return json(403, {
            error: { code: 'STEP_UP_REQUIRED', message: 'Confirm it is you to continue.' },
          });
        }
        deletion = { pending: true };
        return json(200, {
          message: 'Your account is scheduled for deletion.',
          scheduledFor: SCHEDULED_FOR,
          status: 'pending',
          statusReason: 'grace_period',
        });
      }
      if (route === `POST ${STEP_UP_PATH}`) {
        return mockSecondFactorPassed
          ? json(200, { token: 'fixture-step-up-grant' })
          : json(403, {
              error: {
                code: 'STEP_UP_VERIFICATION_REQUIRED',
                message: 'Verify it is you.',
                details: { level: 'second_factor' },
              },
            });
      }
      if (route === `GET ${STEP_UP_PATH}`) {
        return json(200, {
          actions: { 'account.delete': { consequence: 'Your account will be deleted.' } },
        });
      }
      if (route === `PUT ${MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH}`) {
        deletion = { pending: false };
        return json(200, { message: 'Your account deletion was cancelled.', cancelled: true });
      }
      if (route === `GET ${MANAGED_CLOUD_DATA_EXPORT_PATH}`) {
        return json(200, { success: true, status: 'complete', data: { profile: { id: 'a' } } });
      }
      return json(404, {});
    };
  });

  it('checks status, deletes through the identity check, cancels and exports, asking nothing about AI providers', async () => {
    expect(hasCurrentCloudProviderConsent()).toBe(false);
    render(<StepUpHost />);

    const before = parseAccountDeletionStatus(
      await api.get<unknown>(MANAGED_CLOUD_ACCOUNT_DELETION_PATH, { accountEpoch: account() }),
    );
    expect(before.pending).toBe(false);

    const outcome: { settled: boolean; scheduled?: unknown } = { settled: false };
    let sent!: Promise<void>;
    act(() => {
      sent = stepUp
        .withStepUp('account.delete', null, (headers) =>
          api.delete<unknown>(MANAGED_CLOUD_ACCOUNT_DELETION_PATH, {
            headers,
            accountEpoch: account(),
          }),
        )
        .then((value) => {
          outcome.scheduled = value;
        })
        .finally(() => {
          outcome.settled = true;
        });
    });
    for (let turn = 0; turn < 50 && !outcome.settled; turn += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    await sent;
    const scheduled = outcome.scheduled;
    expect(parseAccountDeletionScheduleReceipt(scheduled).status).toBe('pending');

    const pending = parseAccountDeletionStatus(
      await api.get<unknown>(MANAGED_CLOUD_ACCOUNT_DELETION_PATH, { accountEpoch: account() }),
    );
    expect(pending).toEqual(expect.objectContaining({ pending: true, canCancel: true }));

    const cancelled = parseAccountDeletionCancellationReceipt(
      await api.put<unknown>(
        MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
        {
          expectedSchedule: {
            scheduledFor: pending.scheduledFor,
            requestedAt: pending.requestedAt,
          },
        },
        { accountEpoch: account(), auth401Recovery: 'caller-owned' },
      ),
    );
    expect(cancelled.cancelled).toBe(true);

    await exportCloudUserData(account());
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);

    expect(mockRequests.map((request) => `${request.method} ${request.path}`)).toEqual([
      `GET ${MANAGED_CLOUD_ACCOUNT_DELETION_PATH}`,
      `DELETE ${MANAGED_CLOUD_ACCOUNT_DELETION_PATH}`,
      `POST ${STEP_UP_PATH}`,
      `GET ${STEP_UP_PATH}`,
      `POST ${STEP_UP_PATH}`,
      `DELETE ${MANAGED_CLOUD_ACCOUNT_DELETION_PATH}`,
      `GET ${MANAGED_CLOUD_ACCOUNT_DELETION_PATH}`,
      `PUT ${MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH}`,
      `GET ${MANAGED_CLOUD_DATA_EXPORT_PATH}`,
    ]);
    expect(mockRequests.every((request) => request.authorization?.startsWith('Bearer '))).toBe(
      true,
    );
    expect(
      mockRequests
        .filter((request) => request.method === 'POST' && request.path === STEP_UP_PATH)
        .map((request) => request.body),
    ).toEqual([{ action: 'account.delete' }, { action: 'account.delete' }]);
    expect(mockRequests[5]?.stepUpToken).toBe('fixture-step-up-grant');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockStored.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('keeps the identity check closed to every other action in Local Mode', async () => {
    await expect(
      requestStepUpGrant('password.change', null, 'fixture-session-jwt', {
        accountEpoch: account(),
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockRequests).toEqual([]);
  });
});

describe('turning off sharing from Local Mode reaches standing Cloud work', () => {
  const serverSchedule = {
    id: 'schedule-1',
    userId: 'account-a',
    name: 'Morning brief',
    description: null,
    scheduleType: 'cron' as const,
    cronExpression: '0 9 * * 1-5',
    executeAt: null,
    intervalMs: null,
    timezone: 'America/Chicago',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 3,
    actionType: 'agent' as const,
    actionConfig: null,
    prompt: 'Summarize my priorities.',
    model: AUTO_MODEL_ID,
    status: 'active' as const,
    lastExecutedAt: '2026-11-16T14:00:00.000Z',
    nextExecutionAt: '2026-11-18T14:00:00.000Z',
    lastError: null,
    metadata: { productRecurrence: 'weekly', timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] },
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-16T14:00:01.000Z',
  };

  function run(state: (typeof AGENT_TASK_STATES)[number]) {
    return {
      id: RUN_ID,
      userId: 'account-a',
      requestId: 'request-1',
      conversationId: 'conversation-1',
      originSurface: 'mobile',
      workMode: 'agiwork',
      state,
      provider: 'openai',
      model: 'model-1',
      lastEventSequence: 1,
      cancellationRequestedAt: null,
      completedAt: null,
      createdAt: '2026-11-17T11:00:00.000Z',
      updatedAt: '2026-11-17T11:30:00.000Z',
      staleForMs: 0,
    };
  }

  let uninstallDoor: () => void;

  beforeEach(() => {
    recordCloudProviderConsent();
    mockStored.set('ask-from-siri-enabled-v1', true);
    mockStored.set('ask-from-siri-token-id-v1', 'fixture-token-id');
    uninstallDoor = installCloudModeDoor();
    useChatAppModeStore.setState({ appMode: 'local' });
    mockAnswer = (request) => {
      const route = `${request.method} ${request.path}`;
      if (route === `GET ${MANAGED_CLOUD_SCHEDULES_PATH}`) {
        return json(200, {
          schedules: [serverSchedule],
          pagination: { limit: MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE, offset: 0 },
        });
      }
      if (route === `PATCH ${MANAGED_CLOUD_SCHEDULES_PATH}/schedule-1`) {
        return json(200, { schedule: { ...serverSchedule, isEnabled: false } });
      }
      if (route === `GET ${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}`) {
        return json(200, { runs: [run('running')], nextCursor: null });
      }
      if (route === `POST ${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/${RUN_ID}/pause`) {
        return json(200, { run: run('paused') });
      }
      if (route === `DELETE ${MOBILE_INTENT_TOKEN_PATH}`) {
        return json(200, { success: true });
      }
      return json(404, {});
    };
  });

  afterEach(() => {
    uninstallDoor();
  });

  it('removes the Ask from Siri token first, then pauses through the real clients and says what was paused', async () => {
    expect(hasCurrentCloudProviderConsent()).toBe(true);

    await act(async () => {
      await withdrawSharingWithProviders();
    });

    expect(mockEvents[0]).toBe(`remove ${ASK_INTENT_KEYCHAIN_KEY} from the keychain`);
    expect(mockRequests.map((request) => `${request.method} ${request.path}`).sort()).toEqual(
      [
        `DELETE ${MOBILE_INTENT_TOKEN_PATH}`,
        `GET ${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}`,
        `GET ${MANAGED_CLOUD_SCHEDULES_PATH}`,
        `PATCH ${MANAGED_CLOUD_SCHEDULES_PATH}/schedule-1`,
        `POST ${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/${RUN_ID}/pause`,
      ].sort(),
    );
    expect(mockRequests.find((request) => request.method === 'PATCH')?.body).toEqual({
      isActive: false,
    });
    expect(mockRequests.find((request) => request.method === 'DELETE')?.search).toBe(
      '?installId=fixture-install',
    );
    expect(mockRequests.some((request) => request.path.endsWith('/cancel'))).toBe(false);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(standingCloudWorkPausedMessage(1, 1));
    expect(hasCurrentCloudProviderConsent()).toBe(false);
    expect(mockStored.has(CLOUD_PROVIDER_CONSENT_KEY)).toBe(false);
    expect(mockStored.has(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY)).toBe(false);
    expect(mockStored.get('ask-from-siri-enabled-v1')).toBe(false);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
