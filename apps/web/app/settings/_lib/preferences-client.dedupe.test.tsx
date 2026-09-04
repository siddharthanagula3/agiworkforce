import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrowserReplyReadyPreference } from '@/features/chat/hooks/use-browser-reply-ready-preference';
import { useCapabilitiesPreferences } from '@/features/settings/hooks/use-capabilities-preferences';
import { invalidatePreferencesSnapshot } from './preferences-client';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function NotificationsConsumer() {
  const enabled = useBrowserReplyReadyPreference();
  return <output data-testid="notifications">{enabled ? 'enabled' : 'disabled'}</output>;
}

function CapabilitiesConsumer() {
  const { settings } = useCapabilitiesPreferences();
  return <output data-testid="capabilities">{settings.memory ? 'on' : 'off'}</output>;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    ok({
      settings: { notifications: { browserReplyReady: false }, capabilities: { memory: true } },
    }),
  );
  invalidatePreferencesSnapshot();
});

describe('preferences fan-out collapse', () => {
  it('mounts two independent consumers and issues one network call', async () => {
    const { getByTestId } = render(
      <>
        <NotificationsConsumer />
        <CapabilitiesConsumer />
      </>,
    );

    await waitFor(() => expect(getByTestId('notifications').textContent).toBe('disabled'));
    await waitFor(() => expect(getByTestId('capabilities').textContent).toBe('on'));

    expect(requestedUrls()).toHaveLength(1);
  });
});
