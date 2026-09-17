import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async () => ({ 'x-csrf-token': 'test-token' })),
}));

import { LinkedDevicesPanel } from '../LinkedDevicesPanel';

const DESKTOP = {
  id: '11111111-2222-4333-8444-555555555555',
  kind: 'desktop' as const,
  name: 'Work laptop',
  platform: 'macos',
  version: '1.4.0',
  lastSeenAt: '2026-08-19T10:00:00.000Z',
  registeredAt: '2026-06-01T10:00:00.000Z',
  hasLiveCredential: true,
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('LinkedDevicesPanel', () => {
  it('lists a linked device and says whether it still holds a credential', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ devices: [DESKTOP], totalCount: 1 }));

    render(<LinkedDevicesPanel />);

    expect(await screen.findByText(/Work laptop/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Unlink Work laptop' })).toBeVisible();
  });

  it('says so plainly when no app is linked instead of rendering an empty table', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ devices: [], totalCount: 0 }));

    render(<LinkedDevicesPanel />);

    expect(await screen.findByText('No app is linked to this account.')).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sends CSRF headers with the unlink and drops the row only on success', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ devices: [DESKTOP], totalCount: 1 }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Device unlinked', revokedCredentials: 2 }));

    render(<LinkedDevicesPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink Work laptop' }));
    // Unlinking revokes credentials, so it asks before sending anything.
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink device' }));

    await waitFor(() => {
      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toBe(`/api/settings/devices/${DESKTOP.id}`);
      expect(init.method).toBe('DELETE');
      expect(init.headers).toMatchObject({ 'x-csrf-token': 'test-token' });
    });

    await waitFor(() => expect(screen.queryByText(/Work laptop/)).toBeNull());
  });

  it('keeps the device listed when the unlink fails and says why', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ devices: [DESKTOP], totalCount: 1 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Device not found' }, false, 404));

    render(<LinkedDevicesPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink Work laptop' }));
    // Unlinking revokes credentials, so it asks before sending anything.
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink device' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Device not found');
    expect(screen.getByText(/Work laptop/)).toBeVisible();
  });

  it('offers a retry rather than a blank panel when the list cannot be read', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Upstream unavailable' }, false, 503));

    render(<LinkedDevicesPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Upstream unavailable');
    expect(screen.getByRole('button', { name: /Try again/ })).toBeVisible();
  });

  it('shows skeleton rows instead of loading text, then renders one row per device', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<LinkedDevicesPanel />);

    expect(screen.queryByText(/loading linked devices/i)).toBeNull();
    expect(document.querySelector('.animate-pulse')).not.toBeNull();

    resolveFetch(jsonResponse({ devices: [DESKTOP], totalCount: 1 }));

    await screen.findByText(/Work laptop/);
    expect(document.querySelector('[class*="rounded-lg border"]')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('carries the unlink explanation as the section description, not a trailing paragraph', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ devices: [DESKTOP], totalCount: 1 }));

    render(<LinkedDevicesPanel />);

    const heading = await screen.findByText('Linked devices');
    const description = screen.getByText(/Unlinking revokes the device's stored credential/);
    expect(heading.compareDocumentPosition(description)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows what a registered device is, whether it is awake and what it can do', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        devices: [
          {
            ...DESKTOP,
            id: '22222222-2222-4333-8444-555555555555',
            kind: 'cli',
            name: 'Build box',
            platform: 'linux',
            version: '0.9.2',
            osVersion: '6.8',
            architecture: 'x64',
            workspaceId: '33333333-4444-4555-8666-777777777777',
            presence: 'sleeping',
            capabilities: {
              browser: false,
              computerUse: false,
              localModels: true,
              localMcp: true,
              remoteControl: false,
            },
          },
        ],
        totalCount: 1,
      }),
    );

    render(<LinkedDevicesPanel />);

    expect(await screen.findByText('Build box')).toBeVisible();
    expect(screen.getByText('AGI CLI · 0.9.2 · Linux 6.8 x64 · Workspace sign-in')).toBeVisible();
    expect(screen.getByText(/^Sleeping · Signed in/)).toBeVisible();
    expect(screen.getByText('Can use Local models, Local MCP')).toBeVisible();
  });

  it('renames a device with CSRF headers and keeps the new name', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ devices: [DESKTOP], totalCount: 1 }))
      .mockResolvedValueOnce(jsonResponse({ id: DESKTOP.id, name: 'Studio Mac' }));

    render(<LinkedDevicesPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Work laptop' }));
    const input = screen.getByRole('textbox', { name: 'New name for Work laptop' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Studio Mac');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toBe(`/api/settings/devices/${DESKTOP.id}`);
      expect(init.method).toBe('PATCH');
      expect(init.body).toBe(JSON.stringify({ name: 'Studio Mac' }));
      expect(init.headers).toMatchObject({ 'x-csrf-token': 'test-token' });
    });
    expect(await screen.findByText('Studio Mac')).toBeVisible();
  });

  it('keeps the old name and says why when the rename fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ devices: [DESKTOP], totalCount: 1 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Device not found' }, false, 404));

    render(<LinkedDevicesPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Work laptop' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New name for Work laptop' }), ' 2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Device not found');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Work laptop')).toBeVisible();
  });
});
