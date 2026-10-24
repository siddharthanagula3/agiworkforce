import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { composeFreeModelProviderNotice } from '@agiworkforce/compliance';
import { announceNamedProviderConsentRequired } from '../lib/named-provider-consent-client';
import { useNamedProviderConsents } from './use-named-provider-consent';

type PreferencesClient = typeof import('@/app/settings/_lib/preferences-client');

const mocks = vi.hoisted(() => ({ fetchNamespace: vi.fn() }));

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<PreferencesClient>()),
  fetchPreferenceNamespace: mocks.fetchNamespace,
}));

const notice = composeFreeModelProviderNotice('qwen');
const notices = [notice];
const AGREED = {
  qwen: {
    providerId: 'qwen',
    accepted: true,
    acceptedAt: '2026-10-05T09:00:00.000Z',
    disclosureVersion: notice.version,
    surface: 'web',
  },
};

describe('the stored answers to provider notices, as a page reads them', () => {
  beforeEach(() => {
    mocks.fetchNamespace.mockReset().mockResolvedValue(AGREED);
  });

  it('hands back the same object while nothing it reports has changed, so a callback that depends on it is not rebuilt on every render', async () => {
    const { result, rerender } = renderHook(() => useNamedProviderConsents(notices));
    await waitFor(() => expect(result.current.statusOf('qwen')).toBe('accepted'));
    const settled = result.current;

    rerender();
    rerender();

    expect(result.current).toBe(settled);
    expect(result.current.statusOf).toBe(settled.statusOf);
  });

  it('hands back a new object when an answer changes', async () => {
    const { result } = renderHook(() => useNamedProviderConsents(notices));
    await waitFor(() => expect(result.current.statusOf('qwen')).toBe('accepted'));
    const settled = result.current;

    act(() => announceNamedProviderConsentRequired('qwen', 'any-model'));

    expect(result.current).not.toBe(settled);
    expect(result.current.statusOf('qwen')).toBe('missing');
    expect(result.current.recordedFor('qwen')).toBe(true);
  });

  it('reports that the answers could not be read instead of reporting none', async () => {
    mocks.fetchNamespace.mockRejectedValue(new Error('Unavailable'));

    const { result } = renderHook(() => useNamedProviderConsents(notices));

    await waitFor(() => expect(result.current.readFailed).toBe(true));
    expect(result.current.statusOf('qwen')).toBe('unknown');
    expect(result.current.recordedFor('qwen')).toBe(false);
  });
});
