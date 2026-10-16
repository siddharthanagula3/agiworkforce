import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataExportArchive } from '@agiworkforce/cloud-contracts';
import { DataExportRow } from '../DataExportRow';

type CsrfModule = typeof import('@/lib/client/csrf');

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  addCsrfHeaders: vi.fn(async () => ({ 'x-csrf-token': 'token' })),
}));

const ARCHIVES_PATH = '/api/user/export/archives';
const EXPORT_PATH = '/api/user/export';

function archive(overrides: Partial<DataExportArchive> = {}): DataExportArchive {
  return {
    id: 'export-1',
    status: 'preparing',
    delivery: 'in_app',
    requestedAt: '2026-10-16T10:00:00.000Z',
    readyAt: null,
    expiresAt: null,
    volumes: [],
    ...overrides,
  };
}

const readyArchive = (volumeCount: number) =>
  archive({
    status: 'ready',
    readyAt: '2026-10-16T10:05:00.000Z',
    expiresAt: '2026-10-17T10:05:00.000Z',
    volumes: Array.from({ length: volumeCount }, (_, index) => ({
      volume: index + 1,
      byteCount: 1024,
      fileCount: 2,
      downloadPath: `/api/user/export/archives/export-1?volume=${index + 1}`,
    })),
  });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface FetchScript {
  reads: (DataExportArchive | null)[];
  post?: () => Response;
}

function installFetch(script: FetchScript) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === EXPORT_PATH && init?.method === 'POST') {
      return script.post ? script.post() : json({ archive: archive() }, 202);
    }
    if (url === ARCHIVES_PATH) {
      const next = script.reads.length > 1 ? script.reads.shift()! : (script.reads[0] ?? null);
      return json({ archive: next });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function archiveReads(fetchMock: ReturnType<typeof installFetch>): number {
  return fetchMock.mock.calls.filter(([input]) => String(input) === ARCHIVES_PATH).length;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DataExportRow states', () => {
  it('shows a ready export as download links with the time they stop working', async () => {
    installFetch({ reads: [readyArchive(2)] });

    render(<DataExportRow />);

    const first = await screen.findByRole('link', { name: 'Download part 1 of 2' });
    expect(first).toHaveAttribute('href', '/api/user/export/archives/export-1?volume=1');
    expect(screen.getByRole('link', { name: 'Download part 2 of 2' })).toHaveAttribute(
      'href',
      '/api/user/export/archives/export-1?volume=2',
    );
    const expiry = new Date('2026-10-17T10:05:00.000Z').toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(screen.getByText(`The links work until ${expiry}.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
  });

  it('names a single archive without part numbers', async () => {
    installFetch({ reads: [readyArchive(1)] });

    render(<DataExportRow />);

    expect(await screen.findByRole('link', { name: 'Download your export' })).toBeInTheDocument();
    expect(screen.getByText(/^The link works until/)).toBeInTheDocument();
  });

  it('reports a failed export as an alert and lets the reader ask again', async () => {
    installFetch({ reads: [archive({ status: 'failed' })] });

    render(<DataExportRow />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't prepare your export. Try again.",
    );
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
  });

  it('says an expired export needs a new request', async () => {
    installFetch({ reads: [archive({ status: 'expired' })] });

    render(<DataExportRow />);

    expect(
      await screen.findByText(/download link for your last export has expired/i),
    ).toBeInTheDocument();
  });

  it('promises an email only when the export will be emailed', async () => {
    installFetch({
      reads: [null],
      post: () => json({ archive: archive({ delivery: 'email' }) }, 202),
    });

    render(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent("We'll email you a download link when it's ready");
    expect(status).toHaveTextContent('it will also appear here');
    expect(status).toHaveTextContent('The link works for 24 hours once it is ready.');
    expect(screen.getByRole('button', { name: /Preparing/ })).toBeDisabled();
  });

  it('points to this page, not an inbox, when email is off', async () => {
    installFetch({ reads: [null], post: () => json({ archive: archive() }, 202) });

    render(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('A download link will appear here when it');
    expect(status).not.toHaveTextContent(/email/i);
    expect(screen.queryByText(/email/i)).toBeNull();
  });

  it('shows the request failure when the export cannot be started', async () => {
    installFetch({ reads: [null], post: () => json({ error: 'nope' }, 500) });

    render(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
  });
});

describe('DataExportRow polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('polls with a growing delay until the export is ready, then stops', async () => {
    const fetchMock = installFetch({
      reads: [null, archive(), archive(), readyArchive(1)],
    });

    render(<DataExportRow />);
    await advance(0);
    expect(archiveReads(fetchMock)).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await advance(0);
    expect(screen.getByRole('status')).toHaveTextContent("We're preparing your export.");

    await advance(2_999);
    expect(archiveReads(fetchMock)).toBe(1);
    await advance(1);
    expect(archiveReads(fetchMock)).toBe(2);

    await advance(5_999);
    expect(archiveReads(fetchMock)).toBe(2);
    await advance(1);
    expect(archiveReads(fetchMock)).toBe(3);

    await advance(12_000);
    expect(archiveReads(fetchMock)).toBe(4);
    expect(screen.getByRole('link', { name: 'Download your export' })).toBeInTheDocument();

    await advance(10 * 60_000);
    expect(archiveReads(fetchMock)).toBe(4);
  });

  it('gives up after thirty minutes and offers to check again', async () => {
    const fetchMock = installFetch({ reads: [archive()] });

    render(<DataExportRow />);
    await advance(0);
    expect(screen.getByRole('status')).toHaveTextContent("We're preparing your export.");

    await advance(31 * 60_000);
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
    const readsWhenStalled = archiveReads(fetchMock);
    expect(readsWhenStalled).toBeLessThanOrEqual(40);

    await advance(30 * 60_000);
    expect(archiveReads(fetchMock)).toBe(readsWhenStalled);

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await advance(3_000);
    expect(archiveReads(fetchMock)).toBe(readsWhenStalled + 1);
    expect(screen.queryByText(/taking longer than usual/i)).toBeNull();
  });
});
