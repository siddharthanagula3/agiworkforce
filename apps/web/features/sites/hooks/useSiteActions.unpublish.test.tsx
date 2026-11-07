import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { managedCloudPublishedArtifactPath } from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useSiteActions } from './useSiteActions';
import type { PublishedSite } from '../services/sites-service';
import { beginPublicationCleanup, capturePublicationLease, usePublishedSitesStore } from '../stores/published-sites-store';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
const site: PublishedSite = {
  token: 'a'.repeat(24), artifactId: 'artifact-1', conversationId: null,
  title: 'Scoreboard', kind: 'html', language: null, contentChars: 12, version: 1,
  visibility: 'public', createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z', sandboxed: true,
  shareUrl: `https://example.test/shared-artifact/${'a'.repeat(24)}`,
};

beforeEach(() => {
  vi.resetAllMocks();
  beginPublicationCleanup()();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'unpublish-csrf' });
  vi.spyOn(toast, 'success').mockImplementation(() => 'success-toast');
  vi.spyOn(toast, 'error').mockImplementation(() => 'error-toast');
});
afterEach(() => {
  cleanup();
  beginPublicationCleanup()();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const lease = capturePublicationLease()!;
  usePublishedSitesStore.getState().hydrate([site], lease);
  const onUpdated = vi.fn();
  const onUnpublished = vi.fn();
  function Harness() {
    const { dialog, requestUnpublish } = useSiteActions({ lease, onUpdated, onUnpublished });
    return <><button onClick={() => requestUnpublish(site)}>Open unpublish</button>{dialog}</>;
  }
  render(<Harness />);
  return { onUpdated, onUnpublished };
}

async function confirmUnpublish() {
  fireEvent.click(screen.getByRole('button', { name: 'Open unpublish' }));
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: /^Unpublish$/ }));
}

async function expectFinished() {
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(managedCloudPublishedArtifactPath(site.token), {
    method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': 'unpublish-csrf' },
  });
}

describe('real Unpublish confirmation, helper, hook and cache (UNRUN source fixtures)', () => {
  it.each([
    { name: 'wrong target', response: () => Response.json({ success: true, token: 'b'.repeat(24) }) },
    { name: 'false success', response: () => Response.json({ success: false, token: site.token }) },
    { name: 'missing acknowledgement', response: () => Response.json({}) },
    { name: 'empty body', response: () => new Response(null, { status: 204 }) },
    { name: 'malformed JSON', response: () => new Response('not JSON') },
  ])('retains prior cache and emits no success for $name', async ({ response }) => {
    const { onUpdated, onUnpublished } = setup();
    const before = usePublishedSitesStore.getState().byArtifactId;
    fetchMock.mockResolvedValue(response());
    await confirmUnpublish();
    await expectFinished();
    expect(usePublishedSitesStore.getState().byArtifactId).toBe(before);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onUnpublished).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      'This unpublish could not be confirmed. It may have taken effect. Refresh to check before trying again.',
    );
  });

  it('forgets and reports success only after the exact receipt', async () => {
    const { onUnpublished } = setup();
    let resolve!: (body: unknown) => void;
    const response = Response.json({});
    const body = new Promise<unknown>((done) => { resolve = done; });
    const json = vi.spyOn(response, 'json').mockReturnValue(body);
    fetchMock.mockResolvedValue(response);
    await confirmUnpublish();
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    expect(usePublishedSitesStore.getState().byArtifactId[site.artifactId]?.token).toBe(site.token);
    expect(toast.success).not.toHaveBeenCalled();
    expect(onUnpublished).not.toHaveBeenCalled();
    await act(async () => { resolve({ success: true, token: site.token }); });
    await expectFinished();
    expect(usePublishedSitesStore.getState().byArtifactId[site.artifactId]).toBeUndefined();
    expect(onUnpublished).toHaveBeenCalledExactlyOnceWith(site);
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('Unpublished “Scoreboard”. The link no longer works.');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does not adopt a valid late receipt after publication cleanup', async () => {
    const { onUnpublished } = setup();
    let resolve!: (body: unknown) => void;
    const response = Response.json({});
    const body = new Promise<unknown>((done) => { resolve = done; });
    const json = vi.spyOn(response, 'json').mockReturnValue(body);
    fetchMock.mockResolvedValue(response);
    await confirmUnpublish();
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    act(() => beginPublicationCleanup()());
    await act(async () => { resolve({ success: true, token: site.token }); });
    await expectFinished();
    expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
    expect(onUnpublished).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
