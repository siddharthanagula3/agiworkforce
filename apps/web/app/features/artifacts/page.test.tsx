import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));

import ArtifactsFeaturePage from './page';

const UNSHIPPED_LANGUAGE =
  /rolling out|coming soon|on the roadmap|in preview|early access|when it lands/i;

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

describe('ArtifactsFeaturePage capability claims', () => {
  it('does not describe managed publishing as unshipped', () => {
    render(<ArtifactsFeaturePage />);

    const publishRow = screen.getByText('Publish').parentElement;
    expect(publishRow?.textContent ?? '').not.toMatch(UNSHIPPED_LANGUAGE);
  });

  it('describes the publish path that actually ships: a public link plus revocation', () => {
    render(<ArtifactsFeaturePage />);

    const publishRow = screen.getByText('Publish').parentElement?.textContent ?? '';
    expect(publishRow).toMatch(/public page/i);
    expect(publishRow).toMatch(/link/i);
    expect(publishRow).toMatch(/revoke/i);
  });

  it('labels no capability on the page as unshipped while the page claims it works', () => {
    const { container } = render(<ArtifactsFeaturePage />);

    expect(container.textContent ?? '').not.toMatch(UNSHIPPED_LANGUAGE);
  });
});
