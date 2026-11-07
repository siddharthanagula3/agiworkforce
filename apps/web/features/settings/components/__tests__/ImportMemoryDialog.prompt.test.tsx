import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCloudMemoryFixture, getCloudMemoryFixtureSession } from '@/features/memory/__tests__/cloud-memory-fixture';

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>()),
  useSessionSnapshot: () => getCloudMemoryFixtureSession,
  useReadonlyIdentityLifetime: () => () => {
    const session = getCloudMemoryFixtureSession();
    return { isCurrent: () => session?.isCurrent() === true };
  },
}));

let cloud: ReturnType<typeof createCloudMemoryFixture>;
beforeEach(() => { cloud = createCloudMemoryFixture(); });
afterEach(() => { cloud.retire(); vi.unstubAllGlobals(); });

const clipboard = vi.hoisted(() => ({ writeText: vi.fn<(text: string) => Promise<boolean>>() }));

vi.mock('@shared/utils/browser-utils', async (importOriginal) => ({
  ...(await importOriginal<BrowserUtilsModule>()),
  safeClipboard: clipboard,
}));

import { ImportMemoryDialog } from '../ImportMemoryDialog';

type BrowserUtilsModule = typeof import('@shared/utils/browser-utils');

beforeEach(() => {
  clipboard.writeText.mockReset();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Prompt must not request memory data')));
});

describe('Unexecuted cloud ImportMemoryDialog prompt', () => {
  it('explains the import in one sentence and links the memory article', () => {
    render(<ImportMemoryDialog open onOpenChange={() => {}} />, { wrapper: cloud.wrapper });

    expect(
      screen.getByRole('heading', { name: 'Import memory from other AI providers' }),
    ).toBeVisible();
    expect(
      screen.getByText(/^Send the prompt below to your other assistant, then paste its reply/),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      '/help/memory',
    );
  });

  it('copies a one-fact-per-line export prompt the importer can read', async () => {
    clipboard.writeText.mockResolvedValue(true);
    render(<ImportMemoryDialog open onOpenChange={() => {}} />, { wrapper: cloud.wrapper });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    });

    const copied = clipboard.writeText.mock.calls[0]?.[0] ?? '';
    expect(copied).toMatch(/one fact per line/);
    expect(copied).toMatch(/dash/);
    expect(screen.getByText(copied)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(screen.getByText('Prompt copied')).toBeInTheDocument();
  });

  it('says so when the prompt could not be copied', async () => {
    clipboard.writeText.mockResolvedValue(false);
    render(<ImportMemoryDialog open onOpenChange={() => {}} />, { wrapper: cloud.wrapper });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('The prompt was not copied.');
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeVisible();
  });
});
