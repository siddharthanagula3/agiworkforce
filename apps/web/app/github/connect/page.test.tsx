import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  requester: vi.fn(async (..._args: unknown[]): Promise<string | null> => 'm***@example.com'),
  linkingAvailable: vi.fn(() => true),
}));

vi.mock('server-only', () => ({}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({ MarketingFooter: () => null }));
vi.mock('@/lib/github-app', () => ({
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
  getGitHubAppInstallUrl: () => 'https://github.com/apps/agi-workforce/installations/new',
}));
vi.mock('@/lib/github-install-app-return', () => ({
  appInstallRequester: (...args: unknown[]) => mocks.requester(...args),
}));

import GitHubConnectPage from './page';

const STATE = 'f'.repeat(64);

async function render(state?: string): Promise<string> {
  const element = await GitHubConnectPage({
    searchParams: Promise.resolve(state === undefined ? {} : { state }),
  });
  return renderToStaticMarkup(element);
}

describe('/github/connect requester page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requester.mockResolvedValue('m***@example.com');
    mocks.linkingAvailable.mockReturnValue(true);
  });

  it('names the requesting AGI account before anyone reaches GitHub', async () => {
    const html = await render(STATE);

    expect(html).toContain('Connecting GitHub to the AGI Workforce account m***@example.com');
    expect(html).toContain('If someone sent you this link, close this page');
    expect(html).toContain(
      `href="https://github.com/apps/agi-workforce/installations/new?state=${STATE}"`,
    );
    expect(mocks.requester).toHaveBeenCalledWith(STATE);
  });

  it('offers no way on for a used, expired or unknown link', async () => {
    mocks.requester.mockResolvedValue(null);

    const html = await render(STATE);

    expect(html).toContain('This GitHub link has expired');
    expect(html).not.toContain('github.com/apps');
  });

  it('does not look anything up for a malformed state', async () => {
    const html = await render('not-a-state');

    expect(html).toContain('This GitHub link has expired');
    expect(mocks.requester).not.toHaveBeenCalled();
  });
});
