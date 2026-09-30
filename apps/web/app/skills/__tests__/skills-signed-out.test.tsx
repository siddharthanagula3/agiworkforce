import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const authState = { isSignedIn: false, isLoaded: true };

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }) }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => authState,
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useClerk: () => ({ signOut: vi.fn(), openUserProfile: vi.fn() }),
}));

vi.mock('@/features/settings/components/SettingsModalRedirect', () => ({
  SettingsModalRedirect: ({ section }: { section: string }) => (
    <div data-testid="settings-redirect">{section}</div>
  ),
}));

const { mockGetManagedSkillCatalog } = vi.hoisted(() => ({
  mockGetManagedSkillCatalog: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/skill-catalog-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/skill-catalog-service')>()),
  getManagedSkillCatalog: mockGetManagedSkillCatalog,
}));

import SkillsPage from '../page';

async function renderPage() {
  render(await SkillsPage());
}

beforeEach(() => {
  mockGetManagedSkillCatalog.mockReset();
  mockGetManagedSkillCatalog.mockResolvedValue([
    { name: 'review-checklist', description: 'Walks a change through a review checklist.' },
  ]);
});

/**
 * /skills is sitemap-indexed at 0.8 and is the CTA target of two marketing
 * pages, but it rendered null and bounced anonymous visitors to /login. A
 * person who clicked "Browse skills" got a blank frame and a redirect that
 * never said what the page was.
 */
describe('/skills for a signed-out visitor', () => {
  it('explains what the page is instead of rendering nothing', async () => {
    authState.isSignedIn = false;
    authState.isLoaded = true;

    await renderPage();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/skills/i);
    expect(screen.getByText(/reusable instruction set/i)).toBeTruthy();
  });

  it('offers the sign-in rather than performing it', async () => {
    authState.isSignedIn = false;

    await renderPage();

    const signIn = await screen.findByRole('link', { name: /sign in to use skills/i });
    expect(signIn.getAttribute('href')).toBe('/login?redirectTo=%2Fskills');
  });

  it('lists the built-in skills a visitor can expect before signing in', async () => {
    authState.isSignedIn = false;

    await renderPage();

    expect(await screen.findByText('review-checklist')).toBeInTheDocument();
    expect(screen.getByText('Walks a change through a review checklist.')).toBeInTheDocument();
  });

  it('says so when the skill catalogue cannot be read', async () => {
    authState.isSignedIn = false;
    mockGetManagedSkillCatalog.mockRejectedValue(new Error('catalogue offline'));

    await renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent(/temporarily unreachable/i);
  });

  it('still opens the settings surface once signed in', async () => {
    authState.isSignedIn = true;

    await renderPage();

    expect(await screen.findByTestId('settings-redirect')).toHaveTextContent('skills');
  });
});
