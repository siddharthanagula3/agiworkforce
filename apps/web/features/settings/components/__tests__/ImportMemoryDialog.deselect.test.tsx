import { act, fireEvent, render, screen } from '@testing-library/react';
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

import { ImportMemoryDialog } from '../ImportMemoryDialog';

const FIRST = 'The user prefers terse answers';
const SECOND = 'The user works as a backend engineer';

let cloud: ReturnType<typeof createCloudMemoryFixture>;

beforeEach(() => {
  cloud = createCloudMemoryFixture();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith('/api/memory?')) {
        return new Response(JSON.stringify({ memories: [], hasMore: false }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body)) as { mode: string };
      if (body.mode === 'dry-run') {
        return new Response(
          JSON.stringify({
            mode: 'dry-run',
            sourceName: 'ChatGPT',
            sourceValue: 'imported:chatgpt',
            format: 'text',
            items: [
              { content: FIRST, normalizedKey: FIRST.toLowerCase(), duplicate: false },
              { content: SECOND, normalizedKey: SECOND.toLowerCase(), duplicate: false },
            ],
            totalCandidates: 2,
            itemsTruncated: false,
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 500 });
    }),
  );
});

afterEach(() => {
  cloud.retire();
  vi.unstubAllGlobals();
});

describe('Import memory Deselect all', () => {
  it('reads Deselect all when every memory is selected and clears that selection', async () => {
    render(<ImportMemoryDialog open onOpenChange={() => {}} />, { wrapper: cloud.wrapper });
    fireEvent.change(screen.getByLabelText('Paste memories'), {
      target: { value: `${FIRST}\n${SECOND}` },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    });
    await screen.findByRole('list', { name: 'Memories to import' });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Deselect all' }));

    expect(screen.getByRole('checkbox', { name: `Import: ${FIRST}` })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: `Import: ${SECOND}` })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select all' })).not.toBeChecked();
  });

  it('reads Select all when a memory is unchecked and selects every memory', async () => {
    render(<ImportMemoryDialog open onOpenChange={() => {}} />, { wrapper: cloud.wrapper });
    fireEvent.change(screen.getByLabelText('Paste memories'), {
      target: { value: `${FIRST}\n${SECOND}` },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    });
    await screen.findByRole('list', { name: 'Memories to import' });

    fireEvent.click(screen.getByRole('checkbox', { name: `Import: ${FIRST}` }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));

    expect(screen.getByRole('checkbox', { name: `Import: ${FIRST}` })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: `Import: ${SECOND}` })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Deselect all' })).toBeChecked();
  });
});

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
