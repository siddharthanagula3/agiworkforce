import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COOKIE_CONSENT_OPEN_EVENT } from '@shared/lib/cookie-consent';

import { MarketingFooter } from '../MarketingFooter';
import { FOOTER_COLUMNS, FOOTER_LEGAL } from '../nav';

const COOKIE_PREFERENCES = { name: 'Cookie preferences' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MarketingFooter', () => {
  it('makes no universal release or routing promise in its brand statement', () => {
    render(<MarketingFooter />);
    expect(
      screen.getByRole('contentinfo').querySelector('.agi-ds-footer-statement'),
    ).toHaveTextContent('One workspace for AI-assisted work.');
    expect(
      screen.getByRole('contentinfo').querySelector('.agi-ds-footer-statement')?.textContent,
    ).not.toMatch(/six surfaces|your keys|anything leaves your device/u);
  });

  it('exposes the columns and the legal row as named navigation landmarks', () => {
    render(<MarketingFooter />);

    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Legal' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation')).toHaveLength(2);
  });

  it('titles each column with a heading that labels its list, and lists links only', () => {
    render(<MarketingFooter />);
    const columns = screen.getByRole('navigation', { name: 'Footer' });

    const headings = within(columns).getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(
      FOOTER_COLUMNS.map((column) => column.title),
    );

    for (const column of FOOTER_COLUMNS) {
      const list = within(columns).getByRole('list', { name: column.title });
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(column.links.length);
      expect(within(list).getAllByRole('link')).toHaveLength(column.links.length);
    }

    expect(columns.querySelectorAll('li.agi-ds-footer-title')).toHaveLength(0);
    expect(columns.querySelectorAll('li')).toHaveLength(
      within(columns).getAllByRole('link').length,
    );
  });

  it('keeps every legal link inside the Legal landmark', () => {
    render(<MarketingFooter />);
    const legal = screen.getByRole('navigation', { name: 'Legal' });

    expect(
      within(legal)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(FOOTER_LEGAL.map((link) => link.href));
  });

  it('keeps availability labels separate from product names without a wrapping separator', () => {
    render(<MarketingFooter />);
    const footer = screen.getByRole('navigation', { name: 'Footer' });
    const surfaces = within(footer).getByRole('list', { name: 'Surfaces' });
    const labels = [...surfaces.querySelectorAll('.agi-ds-footer-link-status')].map(
      (element) => element.textContent,
    );
    expect(labels).toEqual(
      FOOTER_COLUMNS.find((column) => column.title === 'Surfaces')!.links.flatMap((link) =>
        'status' in link && link.status ? [link.status] : [],
      ),
    );
    expect(labels.every((label) => label && !label.includes('·'))).toBe(true);
  });

  it('opens the cookie manager from a real button placed after the Cookies link', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    render(<MarketingFooter />);
    const legal = screen.getByRole('navigation', { name: 'Legal' });

    const button = within(legal).getByRole('button', COOKIE_PREFERENCES);
    expect(button).toHaveAttribute('type', 'button');
    expect(button.previousElementSibling).toBe(
      within(legal).getByRole('link', { name: 'Cookies' }),
    );

    fireEvent.click(button);

    const opened = dispatch.mock.calls.map(([event]) => event.type);
    expect(opened).toContain(COOKIE_CONSENT_OPEN_EVENT);
  });

  it('keeps the Legal landmark and the cookie control in the condensed footer', () => {
    render(<MarketingFooter condensed />);

    expect(screen.queryByRole('navigation', { name: 'Footer' })).not.toBeInTheDocument();
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(within(legal).getByRole('button', COOKIE_PREFERENCES)).toBeInTheDocument();
    expect(within(legal).getByRole('link', { name: 'Cookies' })).toBeInTheDocument();
  });
});
