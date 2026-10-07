import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));
vi.mock('@/features/marketing/components/Reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';
import ContactSalesPage from './page';

function hero(): HTMLElement {
  const heading = document.getElementById('agi-contact-sales-title');
  const section = heading?.closest('section');
  if (!section) throw new Error('hero section not found');
  return section;
}

describe('ContactSalesPage hero', () => {
  it('links the address in both email actions to the canonical mailto', () => {
    render(<ContactSalesPage />);
    const links = screen.getAllByRole('link', { name: `Email ${CONTACT_EMAIL}` });

    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', contactMailto()));
  });

  it('offers an email call to action in the hero', () => {
    render(<ContactSalesPage />);
    const cta = within(hero()).getByRole('link', { name: `Email ${CONTACT_EMAIL}` });
    expect(cta.getAttribute('href')).toMatch(new RegExp(`^mailto:${CONTACT_EMAIL}`));
    expect(
      within(hero()).getByRole('link', { name: 'See what Enterprise includes' }),
    ).toHaveAttribute('href', '/enterprise');
    expect(within(hero()).getByRole('heading', { level: 1 })).toHaveClass('sr-only');
    expect(hero().querySelector('.agi-ds-pagehead-lede')).toBeNull();
  });

  it('keeps the closing Reach us button', () => {
    render(<ContactSalesPage />);
    expect(screen.getAllByRole('link', { name: `Email ${CONTACT_EMAIL}` })).toHaveLength(2);
  });

  it('never opens a mail client on its own', () => {
    const source = readFileSync(join(process.cwd(), 'app/contact-sales/page.tsx'), 'utf8');
    expect(source).not.toMatch(/useEffect|location\./);
  });
});
