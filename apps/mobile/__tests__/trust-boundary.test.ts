import { SYNTHETIC_LOCAL_MODEL_ID } from '../test-utils/modelFixtures';

const mockSecureFetch = jest.fn();
jest.mock('@/services/secureFetch', () => ({
  secureFetch: (input: unknown, init: unknown) => mockSecureFetch(input, init),
}));

const mockStored = new Map<string, string>();
jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => mockStored.set(key, value),
    delete: (key: string) => mockStored.delete(key),
  },
  mmkvStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
  rehydrateWhenMmkvReady: () => undefined,
  whenMmkvReady: (callback: () => void) => callback(),
}));

import {
  ADULT_ELIGIBILITY_PATH,
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
  MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
  MANAGED_CLOUD_AGENT_RUNS_BASE_PATH,
  MANAGED_CLOUD_DATA_EXPORT_PATH,
  MANAGED_CLOUD_SCHEDULES_PATH,
  MOBILE_INTENT_TOKEN_PATH,
  TERMS_ACCEPTANCE_PATH,
} from '@agiworkforce/cloud-contracts';
import {
  CONTENT_REPORT_PATH,
  EgressBlockedError,
  STEP_UP_PATH,
  guardedFetch,
} from '../lib/egressGuard';
import { API_URL } from '../lib/constants';
import {
  CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY,
  beginCloudProviderConsentWithdrawal,
  recordCloudProviderConsent,
} from '../services/providerConsent';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

type ConversationExecutionMode = 'local' | 'cloud';

const executionModeForModel = (modelId?: string | null): ConversationExecutionMode => {
  const CLOUD_MODEL_PREFIXES = ['claude-', 'gpt-', 'gemini-', 'command-'];
  if (!modelId) return 'local';
  const lower = modelId.toLowerCase();
  const isCloudManaged = CLOUD_MODEL_PREFIXES.some((p) => lower.startsWith(p));
  return isCloudManaged ? 'cloud' : 'local';
};

const providerForExecutionMode = (mode: ConversationExecutionMode): 'local' | 'cloud_managed' => {
  return mode === 'cloud' ? 'cloud_managed' : 'local';
};

describe('conversationMode routing', () => {
  it('null model → local mode', () => {
    expect(executionModeForModel(null)).toBe('local');
  });

  it('undefined model → local mode', () => {
    expect(executionModeForModel(undefined)).toBe('local');
  });

  it('ollama/ prefix → local mode', () => {
    expect(executionModeForModel(`ollama/${SYNTHETIC_LOCAL_MODEL_ID}`)).toBe('local');
  });

  it('lm-studio model → local mode', () => {
    expect(executionModeForModel(`lm-studio/${SYNTHETIC_LOCAL_MODEL_ID}`)).toBe('local');
  });

  it('local: provider maps to local', () => {
    expect(providerForExecutionMode('local')).toBe('local');
  });

  it('cloud: provider maps to cloud_managed (not byok)', () => {
    expect(providerForExecutionMode('cloud')).toBe('cloud_managed');
  });

  it('provider is never undefined', () => {
    const modes: ConversationExecutionMode[] = ['local', 'cloud'];
    for (const mode of modes) {
      expect(providerForExecutionMode(mode)).toBeDefined();
    }
  });
});

describe('mobile trust-boundary gate invariants', () => {
  it('CRITICAL: local mode does not use cloud_managed provider', () => {
    expect(providerForExecutionMode('local')).not.toBe('cloud_managed');
  });

  it('CRITICAL: cloud mode does not use local provider', () => {
    expect(providerForExecutionMode('cloud')).not.toBe('local');
  });

  it('local model is never routed to cloud_managed', () => {
    const mode = executionModeForModel(`ollama/${SYNTHETIC_LOCAL_MODEL_ID}`);
    const provider = providerForExecutionMode(mode);
    expect(provider).toBe('local');
    expect(provider).not.toBe('cloud_managed');
  });

  it('no model ID produces byok, mobile is binary (local or cloud_managed only)', () => {
    const allProviders = (['local', 'cloud'] as const).map(providerForExecutionMode);
    expect(allProviders).not.toContain('byok');
    expect(allProviders).toHaveLength(2);
    expect(new Set(allProviders).size).toBe(2);
  });
});

describe('mobile appMode store defaults', () => {
  it('default appMode is local (privacy-safe default)', () => {
    const DEFAULT_MODE: ConversationExecutionMode = 'local';
    expect(DEFAULT_MODE).toBe('local');
    expect(DEFAULT_MODE).not.toBe('cloud');
  });

  it('modes are mutually exclusive', () => {
    const modes: ConversationExecutionMode[] = ['local', 'cloud'];
    expect(new Set(modes).size).toBe(2);
    expect(modes[0]).not.toBe(modes[1]);
  });
});

describe('tier guard, byok awareness', () => {
  const MOBILE_TIER_ORDER = ['local', 'byok', 'hobby', 'pro', 'pro_plus', 'max'];

  it('byok is positioned between local and hobby in the tier order', () => {
    const localIdx = MOBILE_TIER_ORDER.indexOf('local');
    const byokIdx = MOBILE_TIER_ORDER.indexOf('byok');
    const hobbyIdx = MOBILE_TIER_ORDER.indexOf('hobby');
    expect(byokIdx).toBeGreaterThan(localIdx);
    expect(byokIdx).toBeLessThan(hobbyIdx);
  });

  it('tier order includes all expected tiers', () => {
    expect(MOBILE_TIER_ORDER).toContain('local');
    expect(MOBILE_TIER_ORDER).toContain('byok');
    expect(MOBILE_TIER_ORDER).toContain('pro');
    expect(MOBILE_TIER_ORDER).toContain('max');
  });

  it('local tier is always lowest, never grants managed features', () => {
    const localIdx = MOBILE_TIER_ORDER.indexOf('local');
    expect(localIdx).toBe(0);
    for (const tier of MOBILE_TIER_ORDER.slice(1)) {
      expect(MOBILE_TIER_ORDER.indexOf(tier)).toBeGreaterThan(localIdx);
    }
  });
});

describe('cloud model access gate', () => {
  const isCloudUnlocked = (authToken: string | null, hasSubscription: boolean): boolean => {
    return !!authToken && hasSubscription;
  };

  it('no auth token → cloud locked', () => {
    expect(isCloudUnlocked(null, true)).toBe(false);
  });

  it('auth token but no subscription → cloud locked', () => {
    expect(isCloudUnlocked('tok_abc', false)).toBe(false);
  });

  it('auth token + subscription → cloud unlocked', () => {
    expect(isCloudUnlocked('tok_abc', true)).toBe(true);
  });

  it('CRITICAL: local mode must never see cloud unlocked without auth', () => {
    expect(isCloudUnlocked(null, false)).toBe(false);
    expect(isCloudUnlocked(null, true)).toBe(false);
  });
});

describe('Local mode content-report consent', () => {
  const reportUrl = new URL(CONTENT_REPORT_PATH, API_URL).toString();

  beforeEach(() => mockSecureFetch.mockReset().mockResolvedValue(new Response('ok')));

  it('CRITICAL: a Local mode report never leaves the device without its own Send tap', async () => {
    await expect(guardedFetch(reportUrl, { method: 'POST' })).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('CRITICAL: report consent opens no other managed-cloud route', async () => {
    await expect(
      guardedFetch(
        new URL('/api/chat/send', API_URL).toString(),
        { method: 'POST' },
        {
          consentedReport: true,
        },
      ),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('lets the consented report POST through', async () => {
    await guardedFetch(reportUrl, { method: 'POST' }, { consentedReport: true });
    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
  });
});

describe('Cloud Mode carries content to AI providers only with the permission of the signed-in account', () => {
  const sendUrl = new URL('/api/chat/send', API_URL).toString();
  const termsUrl = new URL(TERMS_ACCEPTANCE_PATH, API_URL).toString();
  const reportUrl = new URL(CONTENT_REPORT_PATH, API_URL).toString();

  beforeEach(() => {
    mockStored.clear();
    mockSecureFetch.mockReset().mockResolvedValue(new Response('ok'));
    __resetCloudAccountSessionForTests();
    activateCloudAccount('person-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  afterEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('CRITICAL: refuses a Cloud send before any network I/O when nothing was allowed', async () => {
    await expect(guardedFetch(sendUrl, { method: 'POST' })).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('CRITICAL: refuses a Cloud send when the permission belongs to another account', async () => {
    recordCloudProviderConsent();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('person-b');

    await expect(guardedFetch(sendUrl, { method: 'POST' })).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('CRITICAL: refuses a Cloud send once the account is signed out', async () => {
    recordCloudProviderConsent();
    invalidateCloudAccount();

    await expect(guardedFetch(sendUrl, { method: 'POST' })).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('keeps the signed-in Terms control and a chosen content report working without it', async () => {
    await guardedFetch(
      termsUrl,
      { method: 'GET', headers: { Authorization: 'Bearer session-token' } },
      { authControl: true },
    );
    await guardedFetch(reportUrl, { method: 'POST' }, { consentedReport: true });
    expect(mockSecureFetch).toHaveBeenCalledTimes(2);
  });

  it('lets a Cloud send through once the signed-in account allowed it', async () => {
    recordCloudProviderConsent();

    await guardedFetch(sendUrl, { method: 'POST' });
    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
  });

  it('leaves Local Mode as it was: the permission opens nothing there', async () => {
    recordCloudProviderConsent();
    useChatAppModeStore.setState({ appMode: 'local' });

    await expect(guardedFetch(sendUrl, { method: 'POST' })).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });
});

describe('account deletion does not depend on sharing with AI providers', () => {
  const deletionUrl = new URL(MANAGED_CLOUD_ACCOUNT_DELETION_PATH, API_URL).toString();
  const cancelUrl = new URL(
    MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
    API_URL,
  ).toString();
  const signedIn = { Authorization: 'Bearer session-token' };

  beforeEach(() => {
    mockStored.clear();
    mockSecureFetch.mockReset().mockResolvedValue(new Response('ok'));
    __resetCloudAccountSessionForTests();
    activateCloudAccount('person-a');
  });

  afterEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it.each(['local', 'cloud'] as const)(
    'lets the signed-in status check, scheduling and cancellation through in %s mode without the permission',
    async (mode) => {
      useChatAppModeStore.setState({ appMode: mode });

      await guardedFetch(deletionUrl, { method: 'GET', headers: signedIn }, { authControl: true });
      await guardedFetch(
        deletionUrl,
        { method: 'DELETE', headers: signedIn },
        { authControl: true },
      );
      await guardedFetch(cancelUrl, { method: 'PUT', headers: signedIn }, { authControl: true });
      expect(mockSecureFetch).toHaveBeenCalledTimes(3);
    },
  );

  it.each([
    ['another method on the deletion path', deletionUrl, 'POST', signedIn, true],
    ['another method on the cancel path', cancelUrl, 'DELETE', signedIn, true],
    ['a query string', `${deletionUrl}?all=1`, 'GET', signedIn, true],
    ['no signed-in session', deletionUrl, 'DELETE', {}, true],
    [
      'a request the API client did not mark as an account control',
      deletionUrl,
      'GET',
      signedIn,
      false,
    ],
    [
      'another path',
      new URL('/api/user/delete-account/cancel', API_URL).toString(),
      'POST',
      signedIn,
      true,
    ],
    ['a content route', new URL('/api/chat/send', API_URL).toString(), 'POST', signedIn, true],
  ] as const)(
    'CRITICAL: still refuses %s in Local Mode, before any network I/O',
    async (_case, url, method, headers, authControl) => {
      useChatAppModeStore.setState({ appMode: 'local' });

      await expect(
        guardedFetch(url, { method, headers: { ...headers } }, { authControl }),
      ).rejects.toBeInstanceOf(EgressBlockedError);
      expect(mockSecureFetch).not.toHaveBeenCalled();
    },
  );
});

describe('the age check that opens Cloud does not depend on sharing with AI providers', () => {
  const eligibilityUrl = new URL(ADULT_ELIGIBILITY_PATH, API_URL).toString();
  const signedIn = { Authorization: 'Bearer session-token' };
  const evidence = JSON.stringify({
    surface: 'mobile-auth',
    evidence: { kind: 'declared_age', age: 30 },
  });

  beforeEach(() => {
    mockStored.clear();
    mockSecureFetch.mockReset().mockResolvedValue(new Response('ok'));
    __resetCloudAccountSessionForTests();
  });

  afterEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it.each(['local', 'cloud'] as const)(
    'lets the signed-in read and the evidence report through in %s mode without the permission',
    async (mode) => {
      useChatAppModeStore.setState({ appMode: mode });

      await guardedFetch(
        eligibilityUrl,
        { method: 'GET', headers: signedIn },
        { authControl: true },
      );
      await guardedFetch(
        eligibilityUrl,
        { method: 'POST', headers: signedIn, body: evidence },
        { authControl: true },
      );
      expect(mockSecureFetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ['a read the API client did not mark as an account control', 'GET', signedIn, undefined, false],
    ['a read with no signed-in session', 'GET', {}, undefined, true],
    ['a read that carries a body', 'GET', signedIn, evidence, true],
    ['another method', 'DELETE', signedIn, undefined, true],
    ['a report with no evidence', 'POST', signedIn, undefined, true],
    [
      'a report that carries anything beside the evidence',
      'POST',
      signedIn,
      JSON.stringify({ ...JSON.parse(evidence), note: 'a message' }),
      true,
    ],
    [
      'a report whose evidence carries free text',
      'POST',
      signedIn,
      JSON.stringify({
        surface: 'mobile-auth',
        evidence: { kind: 'declared_age', age: 30, reason: 'a message' },
      }),
      true,
    ],
    ['a report that is not the evidence at all', 'POST', signedIn, 'a message', true],
  ] as const)(
    'CRITICAL: still refuses %s in Local Mode, before any network I/O',
    async (_case, method, headers, body, authControl) => {
      useChatAppModeStore.setState({ appMode: 'local' });

      await expect(
        guardedFetch(eligibilityUrl, { method, headers: { ...headers }, body }, { authControl }),
      ).rejects.toBeInstanceOf(EgressBlockedError);
      expect(mockSecureFetch).not.toHaveBeenCalled();
    },
  );

  it('CRITICAL: still refuses a query string on the age route in Local Mode', async () => {
    await expect(
      guardedFetch(
        `${eligibilityUrl}?note=a-message`,
        { method: 'GET', headers: signedIn },
        { authControl: true },
      ),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });
});

describe('a withdrawal the app did not live to finish', () => {
  const sendUrl = new URL('/api/chat/send', API_URL).toString();

  beforeEach(() => {
    mockStored.clear();
    mockSecureFetch.mockReset().mockResolvedValue(new Response('ok'));
    __resetCloudAccountSessionForTests();
    activateCloudAccount('person-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  afterEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('CRITICAL: closes Cloud the moment a withdrawal begins, before any network I/O', async () => {
    recordCloudProviderConsent();
    beginCloudProviderConsentWithdrawal();

    await expect(guardedFetch(sendUrl, { method: 'POST' })).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('CRITICAL: lets only the account and withdrawal controls through while it is in progress', async () => {
    recordCloudProviderConsent();
    beginCloudProviderConsentWithdrawal();
    const signedIn = { Authorization: 'Bearer session-token' };

    await expect(
      guardedFetch(
        new URL(CONTENT_REPORT_PATH, API_URL).toString(),
        { method: 'POST' },
        { consentedReport: true },
      ),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(
      guardedFetch(
        new URL('/api/cloud-sync/push', API_URL).toString(),
        { method: 'POST', headers: signedIn },
        { withdrawalControl: true, authControl: true },
      ),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockSecureFetch).not.toHaveBeenCalled();

    await guardedFetch(
      new URL(TERMS_ACCEPTANCE_PATH, API_URL).toString(),
      { method: 'GET', headers: signedIn },
      { authControl: true },
    );
    await guardedFetch(
      new URL(`${MANAGED_CLOUD_SCHEDULES_PATH}?limit=100&offset=0`, API_URL).toString(),
      { method: 'GET', headers: signedIn },
      { withdrawalControl: true },
    );
    expect(mockSecureFetch).toHaveBeenCalledTimes(2);
  });

  it('CRITICAL: closes Cloud on the next launch, before any network I/O', async () => {
    recordCloudProviderConsent();
    mockStored.set(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY, 'an-earlier-launch');

    await expect(guardedFetch(sendUrl, { method: 'POST' })).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });
});

describe('the identity check and the data export do not depend on sharing with AI providers', () => {
  const stepUpUrl = new URL(STEP_UP_PATH, API_URL).toString();
  const exportUrl = new URL(MANAGED_CLOUD_DATA_EXPORT_PATH, API_URL).toString();
  const signedIn = { Authorization: 'Bearer session-token' };
  const deletionCheck = JSON.stringify({ action: 'account.delete' });

  beforeEach(() => {
    mockStored.clear();
    mockSecureFetch.mockReset().mockResolvedValue(new Response('ok'));
    __resetCloudAccountSessionForTests();
    activateCloudAccount('person-a');
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('lets the signed-in identity check for deletion and the export through in Local Mode', async () => {
    await guardedFetch(stepUpUrl, { method: 'GET', headers: signedIn }, { authControl: true });
    await guardedFetch(
      stepUpUrl,
      { method: 'POST', headers: signedIn, body: deletionCheck },
      { authControl: true },
    );
    await guardedFetch(exportUrl, { method: 'GET', headers: signedIn }, { authControl: true });
    expect(mockSecureFetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      'another step-up action',
      stepUpUrl,
      'POST',
      JSON.stringify({ action: 'password.change' }),
      true,
    ],
    [
      'a deletion check carrying more than its action',
      stepUpUrl,
      'POST',
      JSON.stringify({ action: 'account.delete', resourceId: 'org-1' }),
      true,
    ],
    ['a step-up body that is not JSON', stepUpUrl, 'POST', 'account.delete', true],
    ['a step-up request without a body', stepUpUrl, 'POST', undefined, true],
    ['a step-up request the client did not mark', stepUpUrl, 'POST', deletionCheck, false],
    ['a step-up query string', `${stepUpUrl}?action=account.delete`, 'GET', undefined, true],
    ['another method on the export', exportUrl, 'POST', undefined, true],
    ['the export archives', `${exportUrl}/archives`, 'GET', undefined, true],
    ['an export query string', `${exportUrl}?format=zip`, 'GET', undefined, true],
  ] as const)(
    'CRITICAL: refuses %s in Local Mode, before any network I/O',
    async (_case, url, method, body, authControl) => {
      await expect(
        guardedFetch(
          url,
          { method, headers: { ...signedIn }, ...(body === undefined ? {} : { body }) },
          { authControl },
        ),
      ).rejects.toBeInstanceOf(EgressBlockedError);
      expect(mockSecureFetch).not.toHaveBeenCalled();
    },
  );
});

describe('withdrawing the permission reaches standing Cloud work from Local Mode', () => {
  const RUN_ID = '0190a000-0000-7000-8000-000000000081';
  const signedIn = { Authorization: 'Bearer session-token' };
  const at = (path: string) => new URL(path, API_URL).toString();
  const schedules = at(`${MANAGED_CLOUD_SCHEDULES_PATH}?limit=100&offset=200`);
  const pauseSchedule = at(`${MANAGED_CLOUD_SCHEDULES_PATH}/brief-1`);
  const runningRuns = at(
    `${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}?state=queued&state=planning&state=running&state=resuming&limit=25&cursor=abc`,
  );
  const pauseRun = at(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/${RUN_ID}/pause`);
  const revokeAsk = at(`${MOBILE_INTENT_TOKEN_PATH}?installId=install-1`);
  const inactive = JSON.stringify({ isActive: false });

  beforeEach(() => {
    mockStored.clear();
    mockSecureFetch.mockReset().mockResolvedValue(new Response('ok'));
    __resetCloudAccountSessionForTests();
    activateCloudAccount('person-a');
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('lets each withdrawal control through, flagged, signed in, without the permission', async () => {
    await guardedFetch(
      schedules,
      { method: 'GET', headers: signedIn },
      { withdrawalControl: true },
    );
    await guardedFetch(
      pauseSchedule,
      { method: 'PATCH', headers: signedIn, body: inactive },
      { withdrawalControl: true },
    );
    await guardedFetch(runningRuns, { headers: signedIn }, { withdrawalControl: true });
    await guardedFetch(
      pauseRun,
      { method: 'POST', headers: signedIn },
      { withdrawalControl: true },
    );
    await guardedFetch(
      revokeAsk,
      { method: 'DELETE', headers: signedIn },
      { withdrawalControl: true },
    );
    expect(mockSecureFetch).toHaveBeenCalledTimes(5);
  });

  it.each([
    ['the schedule list without the flag', schedules, 'GET', undefined, signedIn, false],
    ['the schedule list without a session', schedules, 'GET', undefined, {}, true],
    [
      'a schedule list with another query',
      at(`${MANAGED_CLOUD_SCHEDULES_PATH}?q=brief`),
      'GET',
      undefined,
      signedIn,
      true,
    ],
    [
      'setting a schedule active',
      pauseSchedule,
      'PATCH',
      JSON.stringify({ isActive: true }),
      signedIn,
      true,
    ],
    [
      'editing a schedule',
      pauseSchedule,
      'PATCH',
      JSON.stringify({ isActive: false, prompt: 'x' }),
      signedIn,
      true,
    ],
    [
      'running a schedule now',
      at(`${MANAGED_CLOUD_SCHEDULES_PATH}/brief-1/runs`),
      'POST',
      undefined,
      signedIn,
      true,
    ],
    ['creating a schedule', at(MANAGED_CLOUD_SCHEDULES_PATH), 'POST', inactive, signedIn, true],
    [
      'listing finished runs',
      at(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}?state=completed&limit=25`),
      'GET',
      undefined,
      signedIn,
      true,
    ],
    [
      'searching runs',
      at(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}?state=running&q=invoice`),
      'GET',
      undefined,
      signedIn,
      true,
    ],
    [
      'listing runs without a state',
      at(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}?limit=25`),
      'GET',
      undefined,
      signedIn,
      true,
    ],
    [
      'cancelling a run',
      at(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/${RUN_ID}/cancel`),
      'POST',
      undefined,
      signedIn,
      true,
    ],
    [
      'resuming a run',
      at(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/${RUN_ID}/resume`),
      'POST',
      undefined,
      signedIn,
      true,
    ],
    ['a pause with a body', pauseRun, 'POST', JSON.stringify({ message: 'x' }), signedIn, true],
    [
      'a pause for something that is not a run',
      at(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/not-a-run/pause`),
      'POST',
      undefined,
      signedIn,
      true,
    ],
    [
      'issuing an Ask from Siri token',
      at(MOBILE_INTENT_TOKEN_PATH),
      'POST',
      undefined,
      signedIn,
      true,
    ],
    ['a revoke naming two tokens', `${revokeAsk}&tokenId=t`, 'DELETE', undefined, signedIn, true],
    ['a Cloud send', at('/api/chat/send'), 'POST', undefined, signedIn, true],
  ] as const)(
    'CRITICAL: refuses %s in Local Mode, before any network I/O',
    async (_case, url, method, body, headers, withdrawalControl) => {
      await expect(
        guardedFetch(
          url,
          { method, headers: { ...headers }, ...(body === undefined ? {} : { body }) },
          { withdrawalControl },
        ),
      ).rejects.toBeInstanceOf(EgressBlockedError);
      expect(mockSecureFetch).not.toHaveBeenCalled();
    },
  );
});
