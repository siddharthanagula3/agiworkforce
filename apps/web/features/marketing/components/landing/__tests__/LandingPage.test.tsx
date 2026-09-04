import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LandingPage } from '../LandingPage';
import {
  CONSOLE_LANES,
  CONSOLE_PROMPT,
  HERO,
  RECEIPT_LABELS,
  ROUTES,
  SURFACES,
  SURFACE_STATE_LABEL,
} from '../landing-content';

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

const receipt = () => screen.getByLabelText(/route receipt/i);

describe('LandingPage', () => {
  it('renders the headline, the prompt and one lane tab per route', () => {
    render(<LandingPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HERO.title);
    expect(screen.getByText(CONSOLE_PROMPT)).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(
      CONSOLE_LANES.map((lane) => lane.name),
    );
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('prints every receipt field for the selected lane and updates it on a switch', () => {
    render(<LandingPage />);
    const [first, , third] = CONSOLE_LANES;
    for (const label of Object.values(RECEIPT_LABELS)) {
      expect(within(receipt()).getByText(label)).toBeInTheDocument();
    }
    expect(within(receipt()).getByText(first!.receipt.cost)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: third!.name }));
    expect(within(receipt()).getByText(third!.receipt.cost)).toBeInTheDocument();
    expect(within(receipt()).queryByText(first!.receipt.left)).not.toBeInTheDocument();
    expect(screen.getByText(third!.activity)).toBeInTheDocument();
  });

  it('moves between lanes with the arrow keys, Home and End', () => {
    render(<LandingPage />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getAllByRole('tab')[1]!, { key: 'End' });
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getAllByRole('tab')[2]!, { key: 'Home' });
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('compares the three routes in a table with one column per lane', () => {
    render(<LandingPage />);
    const table = screen.getByRole('table', { name: /three routes/i });
    for (const column of ROUTES.columns) {
      expect(within(table).getByRole('columnheader', { name: column.title })).toBeInTheDocument();
    }
    for (const row of ROUTES.rows) {
      expect(within(table).getByRole('rowheader', { name: row.label })).toBeInTheDocument();
    }
  });

  it('labels every surface with the release state the download page reports', () => {
    render(<LandingPage />);
    const list = screen.getByRole('list', { name: /release state/i });
    for (const surface of SURFACES) {
      const link = within(list).getByRole('link', { name: surface.name });
      const row = link.closest('li') as HTMLElement;
      expect(row).toHaveAttribute('data-state', surface.state);
      expect(within(row).getByText(SURFACE_STATE_LABEL[surface.state])).toBeInTheDocument();
      if (surface.state === 'pending') {
        expect(within(row).getByText(surface.status)).toBeInTheDocument();
      }
    }
  });
});
