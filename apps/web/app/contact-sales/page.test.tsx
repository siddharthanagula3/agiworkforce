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

import { CONTACT_EMAIL } from '@/lib/legal-constants';
import ContactSalesPage from './page';

function hero(): HTMLElement {
  const heading = document.getElementById('agi-contact-sales-title');
  const section = heading?.closest('section');
  if (!section) throw new Error('hero section not found');
  return section;
}

describe('ContactSalesPage hero', () => {
  it('links the address in the lede to a mailto', () => {
    render(<ContactSalesPage />);
    const link = within(hero()).getByRole('link', { name: CONTACT_EMAIL });
    expect(link.getAttribute('href')).toMatch(new RegExp(`^mailto:${CONTACT_EMAIL}`));
  });

  it('offers an email call to action in the hero', () => {
    render(<ContactSalesPage />);
    const cta = within(hero()).getByRole('link', { name: `Email ${CONTACT_EMAIL}` });
    expect(cta.getAttribute('href')).toMatch(new RegExp(`^mailto:${CONTACT_EMAIL}`));
    expect(
      within(hero()).getByRole('link', { name: 'See what Enterprise includes' }),
    ).toHaveAttribute('href', '/enterprise');
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
