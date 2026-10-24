import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFERENCE_NAMESPACE_SAVED_EVENT } from '@/app/settings/_lib/preferences-client';
import { useBrowserReplyReadyPreference } from './use-browser-reply-ready-preference';
type ScanModule0 = typeof import('@/app/settings/_lib/preferences-client');

const fetchPreferenceNamespace = vi.hoisted(() => vi.fn());

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, fetchPreferenceNamespace };
});

function PreferenceProbe() {
  const enabled = useBrowserReplyReadyPreference();
  return <output>{enabled ? 'enabled' : 'disabled'}</output>;
}

describe('useBrowserReplyReadyPreference', () => {
  beforeEach(() => {
    fetchPreferenceNamespace.mockReset();
    fetchPreferenceNamespace.mockResolvedValue({ browserReplyReady: true });
  });

  it('applies a successful notification preference save without a page reload', async () => {
    render(<PreferenceProbe />);
    await waitFor(() => expect(screen.getByText('enabled')).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(
        new CustomEvent(PREFERENCE_NAMESPACE_SAVED_EVENT, {
          detail: {
            namespace: 'notifications',
            value: { browserReplyReady: false },
          },
        }),
      );
    });

    expect(screen.getByText('disabled')).toBeInTheDocument();
  });

  it('ignores unrelated and malformed preference updates', async () => {
    render(<PreferenceProbe />);
    await waitFor(() => expect(screen.getByText('enabled')).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(
        new CustomEvent(PREFERENCE_NAMESPACE_SAVED_EVENT, {
          detail: { namespace: 'privacy', value: { browserReplyReady: false } },
        }),
      );
      window.dispatchEvent(
        new CustomEvent(PREFERENCE_NAMESPACE_SAVED_EVENT, {
          detail: { namespace: 'notifications', value: { browserReplyReady: 'no' } },
        }),
      );
    });

    expect(screen.getByText('enabled')).toBeInTheDocument();
  });
});
