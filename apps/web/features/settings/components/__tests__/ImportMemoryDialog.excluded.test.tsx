import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCloudMemoryFixture,
  getCloudMemoryFixtureSession,
} from '@/features/memory/__tests__/CloudMemoryFixture';

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useSessionSnapshot: () => getCloudMemoryFixtureSession,
  useReadonlyIdentityLifetime: () => () => {
    const session = getCloudMemoryFixtureSession();
    return { isCurrent: () => session?.isCurrent() === true };
  },
}));

let cloud: ReturnType<typeof createCloudMemoryFixture>;
beforeEach(() => {
  cloud = createCloudMemoryFixture();
});
afterEach(() => {
  cloud.retire();
  vi.unstubAllGlobals();
});

import { ImportMemoryDialog } from '../ImportMemoryDialog';

const EXCLUDED = 'The user home address is 12 Elm Street';
const ALLOWED = 'The user prefers terse answers';

interface CommitCounts {
  insertedCount: number;
  skippedDuplicateCount: number;
  excludedCount: number;
  blockedCount?: number;
}

function stubImportApi(counts: CommitCounts) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (String(_input).startsWith('/api/memory?')) {
      return new Response(JSON.stringify({ memories: [], hasMore: false }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body)) as { mode: string; items?: string[] };
    if (body.mode === 'dry-run') {
      return new Response(
        JSON.stringify({
          mode: 'dry-run',
          sourceName: 'ChatGPT',
          sourceValue: 'imported:chatgpt',
          format: 'text',
          items: [
            { content: EXCLUDED, normalizedKey: EXCLUDED.toLowerCase(), duplicate: false },
            { content: ALLOWED, normalizedKey: ALLOWED.toLowerCase(), duplicate: false },
          ],
          totalCandidates: 2,
          itemsTruncated: false,
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        mode: 'commit',
        sourceName: 'ChatGPT',
        sourceValue: 'imported:chatgpt',
        blockedCount: 0,
        ...counts,
        memories: [],
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function runImport() {
  render(<ImportMemoryDialog open onOpenChange={() => {}} />, { wrapper: cloud.wrapper });

  fireEvent.change(screen.getByLabelText('Paste memories'), {
    target: { value: `${EXCLUDED}\n${ALLOWED}` },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  });
  await screen.findByRole('list', { name: 'Memories to import' });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Import .*selected/ }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Unexecuted cloud import says what the never remember list dropped', () => {
  it('discards a preview body that arrives after close and reopen', async () => {
    let resolve!: (value: unknown) => void;
    let started!: () => void;
    const body = new Promise<unknown>((done) => {
      resolve = done;
    });
    const reading = new Promise<void>((done) => {
      started = done;
    });
    const reply = new Response('{}');
    vi.spyOn(reply, 'json').mockImplementation(() => {
      started();
      return body;
    });
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(reply);
    vi.stubGlobal('fetch', transport);
    const view = render(<ImportMemoryDialog open onOpenChange={() => {}} />, {
      wrapper: cloud.wrapper,
    });
    fireEvent.change(screen.getByLabelText('Paste memories'), { target: { value: ALLOWED } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await reading;
    view.rerender(<ImportMemoryDialog open={false} onOpenChange={() => {}} />);
    view.rerender(<ImportMemoryDialog open onOpenChange={() => {}} />);
    await act(async () => {
      resolve({
        mode: 'dry-run',
        sourceName: 'ChatGPT',
        sourceValue: 'imported:chatgpt',
        format: 'text',
        items: [{ content: ALLOWED, normalizedKey: ALLOWED.toLowerCase(), duplicate: false }],
        totalCandidates: 1,
        itemsTruncated: false,
      });
      await body;
    });
    expect(screen.queryByRole('list', { name: 'Memories to import' })).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('names the count when the server refused some of the selected memories', async () => {
    stubImportApi({ insertedCount: 1, skippedDuplicateCount: 0, excludedCount: 1 });

    await runImport();

    await waitFor(() => expect(screen.getByText('Imported 1 memory from ChatGPT.')).toBeVisible());
    expect(
      screen.getByText('1 memory matched a term on your never remember list and was not saved.'),
    ).toBeVisible();
  });

  it('reads as plural when more than one was refused', async () => {
    stubImportApi({ insertedCount: 0, skippedDuplicateCount: 0, excludedCount: 2 });

    await runImport();

    await waitFor(() =>
      expect(
        screen.getByText(
          '2 memories matched a term on your never remember list and were not saved.',
        ),
      ).toBeVisible(),
    );
  });

  it('names the count when workspace or memory settings blocked some memories', async () => {
    stubImportApi({
      insertedCount: 1,
      skippedDuplicateCount: 0,
      excludedCount: 0,
      blockedCount: 2,
    });

    await runImport();

    await waitFor(() =>
      expect(
        screen.getByText(
          '2 memories were blocked by your memory settings or workspace policy and were not saved.',
        ),
      ).toBeVisible(),
    );
  });

  it('says nothing about exclusions when the list refused none', async () => {
    stubImportApi({ insertedCount: 2, skippedDuplicateCount: 0, excludedCount: 0 });

    await runImport();

    await waitFor(() =>
      expect(screen.getByText('Imported 2 memories from ChatGPT.')).toBeVisible(),
    );
    expect(screen.queryByText(/never remember list/)).toBeNull();
  });
});

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
