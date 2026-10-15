import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  composeFreeModelProviderNotice,
  isNamedProviderConsentCurrent,
} from '@agiworkforce/compliance';
import { getProviderOfferings } from '@agiworkforce/types';
import {
  NAMED_PROVIDER_CONSENT_NAMESPACE,
  readNamedProviderConsent,
} from '@/lib/named-provider-consent';
import { isExperientialFreeOffering } from '@/features/chat/lib/free-quota-selection';
import {
  NAMED_PROVIDER_CONSENT_REQUIRED_EVENT,
  announceNamedProviderConsentRequired,
  freeModelNoticeFor,
  freeModelNotices,
  saveNamedProviderConsent,
} from './named-provider-consent-client';

type PreferencesClient = typeof import('@/app/settings/_lib/preferences-client');

const mocks = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<PreferencesClient>()),
  savePreferenceNamespace: mocks.save,
}));

const notice = composeFreeModelProviderNotice('qwen');
const served = Object.entries(getProviderOfferings()).filter(
  ([modelId, offering]) =>
    offering.identityStatus === 'exact' &&
    offering.quotaProbeProtocol &&
    !isExperientialFreeOffering(modelId),
);

describe('the agreement as the web client writes it', () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue({ version: null });
  });

  it.each([
    ['an agreement', true],
    ['a withdrawal', false],
  ])(
    'writes %s that the reader the free route uses accepts as written',
    async (_label, accepted) => {
      await saveNamedProviderConsent(notice, accepted);

      const [namespace, value, options] = mocks.save.mock.calls[0]!;
      expect(namespace).toBe(NAMED_PROVIDER_CONSENT_NAMESPACE);
      expect(options).toEqual({ merge: true });
      const stored = readNamedProviderConsent(JSON.parse(JSON.stringify(value)), 'qwen');
      expect(stored).toMatchObject({ providerId: 'qwen', accepted, surface: 'web' });
      expect(isNamedProviderConsentCurrent(stored, notice)).toBe(accepted);
    },
  );

  it('has a notice for every free model the free quota route can serve', () => {
    expect(served.length).toBeGreaterThan(0);
    for (const [modelId] of served) {
      expect(freeModelNoticeFor(modelId), modelId).not.toBeNull();
    }
    expect(freeModelNotices().map((entry) => entry.providerId)).toEqual(['qwen']);
    expect(freeModelNoticeFor('auto')).toBeNull();
  });

  it('says which model the server refused, so the notice can tell a chat turn from an image or video request', () => {
    const heard: unknown[] = [];
    const listen = (event: Event) => heard.push((event as CustomEvent<unknown>).detail);
    window.addEventListener(NAMED_PROVIDER_CONSENT_REQUIRED_EVENT, listen);

    announceNamedProviderConsentRequired('qwen', 'fixture-model');
    window.removeEventListener(NAMED_PROVIDER_CONSENT_REQUIRED_EVENT, listen);

    expect(heard).toEqual([{ providerId: 'qwen', modelId: 'fixture-model' }]);
  });
});
