// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import { loadFreePools } from '@/lib/server/free-pools';
import { loadFreeQuotaPolicy } from '@/lib/server/free-quota-catalogue';
import { freeQuotaFixtureNow, servableFreeQuotaOfferings } from '@/test/free-quota-fixtures';
import {
  credentialSha256,
  decideFreeQuotaOffering,
  minimumTurnUnits,
  usableAllowance,
  validateQuotaProbeAuthorization,
  type FreeQuotaDecision,
} from './free-quota-authorization';

const API_KEY = 'fixture-provider-key';
const BENEFITS_PAGE = 'https://home.qwencloud.com/benefits';
const inventory = loadFreePools().inventory!;
const NOW = freeQuotaFixtureNow(inventory);
const policy = loadFreeQuotaPolicy();
const servable = servableFreeQuotaOfferings(inventory, { apiKey: API_KEY, nowMs: NOW });
const videos = servable.filter(({ offering }) => offering.quotaProbeProtocol === 'video-async');
const clipLengths = [...new Set(videos.map(({ offering }) => offering.quotaVideoSeconds!))];
const VIDEO_BY_CLIP_LENGTH = clipLengths.map(
  (seconds) =>
    [seconds, videos.find(({ offering }) => offering.quotaVideoSeconds === seconds)!.key] as const,
);
const polledImage = inventory.entries.find(
  (entry) =>
    entry.quotaOnlyObserved &&
    getProviderOfferings()[entry.offeringKey]!.quotaProbeProtocol === 'image-async',
)!.offeringKey;

function entryFor(key: string) {
  return inventory.entries.find((entry) => entry.offeringKey === key)!;
}

function decide(
  key: string,
  used: number,
  entry: ReturnType<typeof entryFor> = entryFor(key),
): FreeQuotaDecision {
  return decideFreeQuotaOffering({
    entry,
    offering: getProviderOfferings()[key]!,
    policy,
    nowMs: NOW,
    apiKey: API_KEY,
    mediaServed: true,
    state: {
      attestation: {
        sourceUrl: BENEFITS_PAGE,
        checkedAtMs: NOW,
        credentialSha256: credentialSha256(API_KEY),
        quotaOnlyOfferings: 'all',
        attestedBy: 'fixture-operator',
      },
      suspendedAtMs: null,
      holds: new Map(),
      used: new Map([[key, used]]),
    },
    termsReviewed: true,
  });
}

function verification(
  offeringKey: string,
  unit: 'tokens' | 'images' | 'seconds',
  remaining: number,
) {
  return {
    sourceUrl: BENEFITS_PAGE,
    checkedAtMs: NOW - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    offerings: [
      { offeringKey, quotaOnly: true, unit, remaining, expiresAtMs: NOW + 24 * 60 * 60 * 1_000 },
    ],
  };
}

describe('what one request needs from a free allowance', () => {
  it('is the clip length of that video offering, one image, or the chat minimum', () => {
    expect(clipLengths.length).toBeGreaterThan(1);
    expect(clipLengths).not.toContain(policy.videoSeconds);
    const needed = new Map<string, Set<number>>();
    for (const offering of Object.values(getProviderOfferings())) {
      const protocol = offering.quotaProbeProtocol;
      if (!protocol) continue;
      const units = minimumTurnUnits(offering, policy);
      needed.set(protocol, (needed.get(protocol) ?? new Set<number>()).add(units));
      if (protocol === 'video-async') expect(units).toBe(offering.quotaVideoSeconds);
    }
    expect(needed.get('image-sync')).toEqual(new Set([1]));
    expect(needed.get('image-async')).toEqual(new Set([1]));
    expect(needed.get('chat')).toEqual(new Set([policy.minimumChatQuota]));
  });

  it.each(VIDEO_BY_CLIP_LENGTH)(
    'keeps a %i second offering ready with one clip left and reports it spent with a second less',
    (clipSeconds, key) => {
      const usable = usableAllowance(entryFor(key), policy);
      expect(clipSeconds - 1).toBeGreaterThanOrEqual(policy.videoSeconds);

      expect(decide(key, usable - clipSeconds)).toEqual({
        status: 'ready',
        usable,
        used: usable - clipSeconds,
      });
      expect(decide(key, usable - clipSeconds + 1)).toEqual({
        status: 'exhausted',
        cause: 'allowance',
      });
    },
  );

  it('decides an image offering the provider answers through a polled task on its image allowance', () => {
    const usable = usableAllowance(entryFor(polledImage), policy);

    expect(decide(polledImage, 0)).toEqual({ status: 'ready', usable, used: 0 });
    expect(decide(polledImage, usable - 1)).toEqual({ status: 'ready', usable, used: usable - 1 });
    expect(decide(polledImage, usable)).toEqual({ status: 'exhausted', cause: 'allowance' });
    expect(decide(polledImage, 0, { ...entryFor(polledImage), unit: 'seconds' })).toEqual({
      status: 'unavailable',
      reason: 'allowance_unknown',
    });
  });
});

describe('what a quota experiment needs verified first', () => {
  it.each(VIDEO_BY_CLIP_LENGTH)(
    'is one whole %i second clip for that video offering',
    (clipSeconds, key) => {
      expect(() =>
        validateQuotaProbeAuthorization(
          verification(key, 'seconds', clipSeconds - 1),
          API_KEY,
          key,
          policy,
          NOW,
        ),
      ).toThrow('insufficient');
      expect(() =>
        validateQuotaProbeAuthorization(
          verification(key, 'seconds', clipSeconds),
          API_KEY,
          key,
          policy,
          NOW,
        ),
      ).not.toThrow();
    },
  );

  it('is one image, counted in images, for an offering answered through a polled task', () => {
    expect(() =>
      validateQuotaProbeAuthorization(
        verification(polledImage, 'images', 1),
        API_KEY,
        polledImage,
        policy,
        NOW,
      ),
    ).not.toThrow();
    expect(() =>
      validateQuotaProbeAuthorization(
        verification(polledImage, 'tokens', policy.minimumChatQuota),
        API_KEY,
        polledImage,
        policy,
        NOW,
      ),
    ).toThrow('unit does not match');
  });
});
