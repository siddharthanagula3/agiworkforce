import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type SurfaceStatusModule = typeof import('@/lib/surface-status');

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));
vi.mock('@/lib/surface-status', async (importOriginal) => ({
  ...(await importOriginal<SurfaceStatusModule>()),
  UNRELEASED_SURFACES: [],
}));

import { ReleaseNotesPage } from '../ReleaseNotesPage';
import { FORTHCOMING } from '../release-notes-data';

describe('/release-notes once every surface is released', () => {
  it('drops the Forthcoming heading, its hero fact and the lede sentence about it, instead of a heading over an empty list', () => {
    render(<ReleaseNotesPage titleId="release-notes-title" />);

    expect(FORTHCOMING).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Forthcoming.' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Forthcoming' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/forthcoming/i);
    expect(screen.getByRole('list', { name: 'Releases' })).toBeTruthy();
    expect(document.body.textContent).toContain(
      'Work on a surface with no published release is marked not yet released.',
    );
  });
});
