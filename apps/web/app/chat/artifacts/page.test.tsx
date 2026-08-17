import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="managed-app-shell">{children}</div>
  ),
}));

vi.mock('@/app/gallery/GalleryClient', () => ({
  GalleryClient: ({ chrome }: { chrome?: string }) => (
    <div data-testid="gallery-client" data-chrome={chrome}>
      Canonical Artifacts Gallery
    </div>
  ),
}));

import { APP_NAV_DESTINATIONS } from '@shared/components/layout/app-nav-items';

import ChatArtifactsRoute, { metadata } from './page';

describe('/chat/artifacts route', () => {
  it('mounts the canonical gallery inside the authenticated app shell', () => {
    render(<ChatArtifactsRoute />);

    expect(screen.getByTestId('managed-app-shell')).toHaveTextContent(
      'Canonical Artifacts Gallery',
    );
    // Not a forked copy of the gallery — the same component the public
    // /gallery route renders, told which chrome wraps it.
    expect(screen.getByTestId('gallery-client')).toHaveAttribute('data-chrome', 'app');
  });

  it('leaves /gallery as the indexed URL for this content', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toBe('/gallery');
  });
});

describe('Artifacts rail destination', () => {
  const artifacts = APP_NAV_DESTINATIONS.find((d) => d.id === 'artifacts');

  it('keeps the user in the product shell instead of the marketing page', () => {
    // Regression guard: this pointed at /gallery, which renders the marketing
    // Header + MarketingFooter and no app sidebar, so the primary rail threw
    // signed-in users out of the shell. /gallery stays public for SEO and for
    // signed-out visitors; the rail goes to the in-shell mount.
    expect(artifacts?.href).toBe('/chat/artifacts');
  });

  it('lights exactly one rail entry on /chat/artifacts', () => {
    // `chat-home` claims every /chat/... path that is not its own section, so
    // omitting /chat/artifacts from CHAT_SECTION_PREFIXES would light both
    // Chat and Artifacts at once.
    const active = APP_NAV_DESTINATIONS.filter((d) => d.isActive('/chat/artifacts'));

    expect(active.map((d) => d.id)).toEqual(['artifacts']);
  });

  it('does not claim the public /gallery route', () => {
    expect(APP_NAV_DESTINATIONS.filter((d) => d.isActive('/gallery'))).toEqual([]);
  });
});
