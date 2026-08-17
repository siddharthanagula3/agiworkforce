jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/api', () => ({ api: { get: jest.fn() } }));

import {
  CAPABILITY_CONTRACT_ACCOUNT,
  CAPABILITY_CONTRACT_EXPECTATIONS,
  parseEffectiveCapabilityDocument,
} from '@agiworkforce/cloud-contracts';
import type { PlatformCapability } from '@agiworkforce/types';
import {
  isCapabilityRequestable,
  resolveMobileCapabilityDecision,
  useTierStore,
} from '../src/features/billing/store';

const CONTRACT_CAPABILITIES = Object.keys(
  CAPABILITY_CONTRACT_EXPECTATIONS,
) as (keyof typeof CAPABILITY_CONTRACT_EXPECTATIONS)[];

function serverDocumentForContractAccount() {
  const granted = CONTRACT_CAPABILITIES.filter(
    (capability) => CAPABILITY_CONTRACT_EXPECTATIONS[capability].allowed,
  );
  const deniedBy = Object.fromEntries(
    CONTRACT_CAPABILITIES.filter(
      (capability) => !CAPABILITY_CONTRACT_EXPECTATIONS[capability].allowed,
    ).map((capability) => [capability, ['tier']]),
  );
  return parseEffectiveCapabilityDocument({
    sessionId: CAPABILITY_CONTRACT_ACCOUNT.userId,
    version: 'me-handshake-v1#contract',
    computedAt: CAPABILITY_CONTRACT_ACCOUNT.computedAt,
    sources: {
      model: 'models.json@contract',
      tier: `tier:${CAPABILITY_CONTRACT_ACCOUNT.tier}`,
      surface: 'surface:mobile',
      settings: 'settings:none-configured',
    },
    granted,
    deniedBy,
    limits: [
      {
        id: 'managed_usage_rolling_five_hour_cents',
        capabilityId: 'canUseCloudModels',
        limit: 500,
        unit: 'usage_cents',
        window: 'rolling_five_hour',
        resetsAt: CAPABILITY_CONTRACT_ACCOUNT.rollingFiveHourResetsAt,
        policySource: `managed-usage-caps:${CAPABILITY_CONTRACT_ACCOUNT.tier}`,
      },
    ],
  });
}

beforeEach(() => {
  useTierStore.setState({
    capabilityDocument: serverDocumentForContractAccount(),
    grantedCapabilities: [],
    capabilityHandshakeReceived: true,
  });
});

describe('BILL-15 — the mobile surface resolves the contract account exactly as the contract declares', () => {
  it.each(CONTRACT_CAPABILITIES)('%s', (capability) => {
    const expected = CAPABILITY_CONTRACT_EXPECTATIONS[capability];
    const decision = resolveMobileCapabilityDecision(capability as PlatformCapability);
    expect(decision).not.toBeNull();
    expect({ allowed: decision?.allowed, policySource: decision?.policySource }).toEqual(expected);
    expect(isCapabilityRequestable(capability)).toBe(expected.allowed);
  });
});

describe('BILL-15 — the mobile surface keeps the limits the server published', () => {
  it('exposes the rolling five-hour window with its authoritative resetsAt and policySource', () => {
    const decision = resolveMobileCapabilityDecision('canUseCloudModels');
    expect(decision?.limits).toEqual([
      {
        id: 'managed_usage_rolling_five_hour_cents',
        capabilityId: 'canUseCloudModels',
        limit: 500,
        unit: 'usage_cents',
        window: 'rolling_five_hour',
        resetsAt: CAPABILITY_CONTRACT_ACCOUNT.rollingFiveHourResetsAt,
        policySource: `managed-usage-caps:${CAPABILITY_CONTRACT_ACCOUNT.tier}`,
      },
    ]);
  });

  it('a document with no limits key still parses — an older server must not crash the client', () => {
    const legacy = parseEffectiveCapabilityDocument({
      sessionId: 'legacy',
      version: 'v',
      computedAt: CAPABILITY_CONTRACT_ACCOUNT.computedAt,
      sources: { model: 'm', tier: 't', surface: 's', settings: 'x' },
      granted: ['canChat'],
      deniedBy: {},
    });
    expect(legacy.limits).toEqual([]);
  });
});
