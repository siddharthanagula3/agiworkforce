import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import { ImportMemoryDialog } from '../ImportMemoryDialog';

const EXCLUDED = 'The user home address is 12 Elm Street';
const ALLOWED = 'The user prefers terse answers';

interface CommitCounts {
  insertedCount: number;
  skippedDuplicateCount: number;
  excludedCount: number;
}

function stubImportApi(counts: CommitCounts) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
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
        ...counts,
        memories: [],
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function runImport() {
  render(<ImportMemoryDialog open onOpenChange={() => {}} />);

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

describe('an import says what the never remember list dropped', () => {
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

  it('says nothing about exclusions when the list refused none', async () => {
    stubImportApi({ insertedCount: 2, skippedDuplicateCount: 0, excludedCount: 0 });

    await runImport();

    await waitFor(() =>
      expect(screen.getByText('Imported 2 memories from ChatGPT.')).toBeVisible(),
    );
    expect(screen.queryByText(/never remember list/)).toBeNull();
  });
});
