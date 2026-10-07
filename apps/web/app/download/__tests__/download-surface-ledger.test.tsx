import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.stubGlobal('fetch', fetchMock);
vi.mock('@shared/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { error: vi.fn() },
}));
vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUser: () => ({ user: null, isLoaded: true }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock('@/features/marketing/components/Reveal', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Reveal: ({ children }: { children: React.ReactNode }) => children,
}));

import {
  AVAILABLE_NOW_LABEL,
  COMING_SOON_LABEL,
  SURFACE_IDS,
  SURFACE_NAMES,
  SURFACE_STATUS,
} from '@/lib/surface-status';
import DownloadPage from '../page';

const PAGE_SOURCE = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8');

function notFound() {
  return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
}

beforeEach(() => {
  fetchMock.mockImplementation(() => Promise.resolve(notFound()));
});

describe('the /download surface availability ledger', () => {
  it('lists every surface in the registry, once, with the status the registry holds', () => {
    render(<DownloadPage />);

    const ledger = screen.getByRole('list', { name: 'Surface availability' });
    const rows = within(ledger).getAllByRole('listitem');
    expect(rows).toHaveLength(SURFACE_IDS.length);

    SURFACE_IDS.forEach((surface, index) => {
      const row = rows[index]!;
      expect(row.querySelector('.agi-ds-ledger-label')).toHaveTextContent(SURFACE_NAMES[surface]);
      expect(row).toHaveTextContent(`${SURFACE_STATUS[surface]}.`);
    });
  });

  it('sits above the live Desktop and CLI checks it summarises', () => {
    render(<DownloadPage />);

    const ledger = screen.getByRole('list', { name: 'Surface availability' });
    const desktop = screen.getByRole('region', { name: 'Desktop installer availability' });
    expect(ledger.compareDocumentPosition(desktop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('links Desktop and CLI to their live sections and the notify-list surfaces to the form', () => {
    render(<DownloadPage />);

    const ledger = screen.getByRole('list', { name: 'Surface availability' });
    expect(within(ledger).getByRole('link', { name: 'Use AGI Web' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2F',
    );
    expect(
      within(ledger).getByRole('link', { name: 'Check Desktop availability' }),
    ).toHaveAttribute('href', '/download#desktop-downloads');
    expect(within(ledger).getByRole('link', { name: 'Check CLI availability' })).toHaveAttribute(
      'href',
      '/download#cli-downloads',
    );
    const notify = within(ledger).getAllByRole('link', { name: 'Get notified' });
    expect(notify).toHaveLength(3);
    for (const link of notify) expect(link).toHaveAttribute('href', '#notify');
    expect(document.getElementById('notify')).not.toBeNull();
  });

  it('types no row and no status label by hand', () => {
    expect(PAGE_SOURCE).toContain('SURFACE_IDS.map(');
    expect(PAGE_SOURCE).not.toContain(AVAILABLE_NOW_LABEL);
    expect(PAGE_SOURCE).not.toContain(COMING_SOON_LABEL);
  });

  it('labels the hero transcript as example output, not a session that happened', () => {
    render(<DownloadPage />);

    expect(
      screen.getByRole('region', { name: 'Example output from verifying a CLI archive' }),
    ).toBeInTheDocument();
    expect(PAGE_SOURCE).not.toContain('A real installer verification session');
  });
});
