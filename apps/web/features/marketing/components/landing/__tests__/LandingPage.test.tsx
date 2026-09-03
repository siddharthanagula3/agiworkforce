import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LandingPage } from '../LandingPage';
import { CONSOLE_LANES, CONSOLE_PROMPT, HERO, SURFACES } from '../landing-content';

vi.mock('../../system', () => ({
  Button: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  ButtonRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MarketingFooter: () => <footer />,
  MarketingHeader: () => <header />,
  MotionReveal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ProductFrame: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

describe('LandingPage', () => {
  it('renders the headline, the prompt and one receipt per lane', () => {
    render(<LandingPage />);
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent(HERO.accent);
    expect(screen.getByText(CONSOLE_PROMPT)).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(
      CONSOLE_LANES.map((lane) => expect.stringContaining(lane.name)),
    );
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('lists every surface with the release state the download page reports', () => {
    render(<LandingPage />);
    for (const surface of SURFACES) {
      const link = screen.getByRole('link', { name: surface.name });
      const row = link.closest('li');
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getByText(surface.status)).toBeInTheDocument();
    }
  });

  it('describes the routing board for screen readers without the drawing', () => {
    render(<LandingPage />);
    expect(
      screen.getByRole('figure', { name: /models on the left route through agi/i }),
    ).toBeInTheDocument();
  });
});
