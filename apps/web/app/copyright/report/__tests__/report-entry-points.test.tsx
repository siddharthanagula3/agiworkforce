import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const SHARE_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ARTIFACT_TOKEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: async () => [
      {
        title: 'Shared conversation',
        model_id: 'fixture-model',
        provider: 'fixture-provider',
        messages: [],
        total_messages: 1,
        expires_at: '2099-01-01T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    execute: async () => 0,
  }),
}));

vi.mock('@/features/chat/components/share/SharedSessionViewer', () => ({
  SharedSessionViewer: () => <div data-testid="shared-session-viewer" />,
}));
vi.mock('@/features/chat/components/share/ExpiredShareBanner', () => ({
  ExpiredShareBanner: () => <div />,
}));

vi.mock('../../../shared-artifact/[token]/PublishedArtifactView', () => ({
  PublishedArtifactView: () => <div data-testid="published-artifact-view" />,
}));

vi.mock('@/lib/services/published-artifact-service', () => ({
  PUBLISHED_TOKEN_REGEX: /^[A-Za-z0-9_-]{24}$/,
  getPublishedArtifactByToken: async () => ({
    title: 'Published artifact',
    kind: 'markdown',
    language: null,
    content: '# hello',
    updatedAt: '2026-02-02T00:00:00.000Z',
  }),
}));

import SharedSessionPage from '../../../share/[token]/page';
import PublishedArtifactPage from '../../../shared-artifact/[token]/page';
import { reportHref } from '../ReportContentLink';

async function renderPage(page: Promise<React.ReactElement>) {
  render(await page);
}

describe('rights-holder entry point on the public viewers', () => {
  it('gives a shared conversation page a link that carries its own URL into the notice form', async () => {
    await renderPage(
      SharedSessionPage({
        params: Promise.resolve({ token: SHARE_TOKEN }),
      }) as Promise<React.ReactElement>,
    );

    const link = screen.getByRole('link', { name: /report copyright infringement/i });
    expect(link).toHaveAttribute('href', reportHref(`/share/${SHARE_TOKEN}`));
  });

  it('gives a published artifact page the same link', async () => {
    await renderPage(
      PublishedArtifactPage({
        params: Promise.resolve({ token: ARTIFACT_TOKEN }),
      }) as Promise<React.ReactElement>,
    );

    const link = screen.getByRole('link', { name: /report copyright infringement/i });
    expect(link).toHaveAttribute('href', reportHref(`/shared-artifact/${ARTIFACT_TOKEN}`));
  });

  it('points at the form route with the reported URL encoded as a query parameter', () => {
    expect(reportHref(`/share/${SHARE_TOKEN}`)).toBe(
      `/copyright/report?url=%2Fshare%2F${SHARE_TOKEN}`,
    );
  });
});
