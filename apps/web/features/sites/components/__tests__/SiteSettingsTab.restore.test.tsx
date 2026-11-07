import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  managedCloudPublishedArtifactVersionPath,
  managedCloudPublishedArtifactVersionsPath,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toast } from 'sonner';
import { SiteSettingsTab } from '../SiteSettingsTab';
import type { PublishedSite } from '../../services/sites-service';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn<typeof fetch>();
const site: PublishedSite = {
  token: 'a'.repeat(24), artifactId: 'artifact-1', conversationId: null,
  title: 'Scoreboard', kind: 'html', language: null, contentChars: 12, version: 8,
  visibility: 'public', createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z', sandboxed: true,
  shareUrl: `https://example.test/shared-artifact/${'a'.repeat(24)}`,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'restore-csrf' });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function restore(response: Response) {
  fetchMock.mockImplementation(async (input, init) => {
    if (input === managedCloudPublishedArtifactVersionsPath(site.token) && !init?.method) {
      return Response.json({ versions: [
        { version: 7, title: site.title, kind: site.kind, createdAt: site.createdAt, live: false },
        { version: 8, title: site.title, kind: site.kind, createdAt: site.updatedAt, live: true },
      ] });
    }
    if (input === managedCloudPublishedArtifactVersionPath(site.token, 7) && init?.method === 'POST') {
      return response;
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  const onRestored = vi.fn();
  render(<SiteSettingsTab
    site={site} workspace={null} onRestored={onRestored}
    onCopyLink={vi.fn()} onRename={vi.fn()} onSetVisibility={vi.fn()} onUnpublish={vi.fn()}
  />);
  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
  return onRestored;
}

function expectOnlyHistoryAndRestore() {
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0]?.[0]).toBe(managedCloudPublishedArtifactVersionsPath(site.token));
  expect(fetchMock.mock.calls[1]).toEqual([
    managedCloudPublishedArtifactVersionPath(site.token, 7),
    { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': 'restore-csrf' }, signal: expect.any(AbortSignal) },
  ]);
}

describe('real Sites settings and restore helper acknowledgement (UNRUN source fixtures)', () => {
  it.each([
    ['empty', () => new Response(null, { status: 204 })],
    ['malformed JSON', () => new Response('not JSON')],
    ['missing receipt', () => Response.json({})],
    ['wrong token', () => Response.json({ token: 'b'.repeat(24), version: 9 })],
    ['invalid version', () => Response.json({ token: site.token, version: 0 })],
  ] as const)('does not report selected history live for %s acknowledgement', async (_name, response) => {
    const onRestored = await restore(response());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This version restore could not be confirmed. It may have taken effect.',
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
    expectOnlyHistoryAndRestore();
  });

  it.each([7, 8, 9])('reports acknowledged restore version %s through the real helper', async (version) => {
    const onRestored = await restore(Response.json({ token: site.token, version }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('Version 7 is live again');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectOnlyHistoryAndRestore();
  });
});
