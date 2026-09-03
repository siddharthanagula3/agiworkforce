import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LandingPage } from '../LandingPage';
import { HERO_QUESTION, HERO_ROUTES } from '../landing-content';

const REDUNDANT_ENUMERATION_PATTERN = /ask something and agi can answer it three ways/i;

vi.mock('../../system', () => ({
  Button: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  ButtonRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HeroHeadline: ({ id, text }: { id: string; text: string }) => <h1 id={id}>{text}</h1>,
  Ledger: ({ caption }: { caption: string }) => <div>{caption}</div>,
  MarketingFooter: () => <footer />,
  MarketingHeader: () => <header />,
  MotionReveal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ProductFrame: () => <div />,
  Prose: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  Section: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  StickyLedger: ({ heading, panels }: { heading: ReactNode; panels: { body: ReactNode }[] }) => (
    <div>
      {heading}
      {panels.map((panel, index) => (
        <div key={index}>{panel.body}</div>
      ))}
    </div>
  ),
  SurfaceStatus: () => <div />,
  WEB_ENTRY_HREF: '/app',
}));

describe('LandingPage hero copy', () => {
  it('does not restate the route receipts as a three-way enumeration paragraph', () => {
    render(<LandingPage />);
    expect(screen.queryByText(REDUNDANT_ENUMERATION_PATTERN)).not.toBeInTheDocument();
  });

  it('still renders the hero headline and every route receipt note', () => {
    render(<LandingPage />);
    expect(screen.getByText(HERO_QUESTION)).toBeInTheDocument();
    for (const route of HERO_ROUTES) {
      expect(screen.getByText(route.note)).toBeInTheDocument();
    }
  });
});
