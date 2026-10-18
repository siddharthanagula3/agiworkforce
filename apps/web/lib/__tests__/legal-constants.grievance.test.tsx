import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONTACT_EMAIL,
  GRIEVANCE_OFFICER_DESIGNATE,
  GRIEVANCE_OFFICER_NAME,
  GRIEVANCE_OFFICER_ROLE,
  LEGAL_ENTITY,
  grievanceOfficerLabel,
} from '../legal-constants';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

const webRoot = join(__dirname, '..', '..');

const GRIEVANCE_SURFACES = [
  'app/dpa/page.tsx',
  'app/privacy/india/page.tsx',
  'app/privacy/requests/page.tsx',
  'app/terms/page.tsx',
];

const readSurface = (relative: string) => readFileSync(join(webRoot, relative), 'utf8');

describe('published grievance officer', () => {
  it('publishes the role account while no individual is designated', () => {
    expect(GRIEVANCE_OFFICER_DESIGNATE).toBeNull();
    expect(GRIEVANCE_OFFICER_NAME).toBe(`${GRIEVANCE_OFFICER_ROLE}, ${LEGAL_ENTITY}`);
  });

  it('carries a designated individual into the published label', () => {
    expect(grievanceOfficerLabel('A. Designate')).toBe(
      `A. Designate, ${GRIEVANCE_OFFICER_ROLE}, ${LEGAL_ENTITY}`,
    );
  });

  it('derives the published name from the designation seam', () => {
    expect(GRIEVANCE_OFFICER_NAME).toBe(grievanceOfficerLabel(GRIEVANCE_OFFICER_DESIGNATE));
  });

  it('publishes the grievance route on every policy page that names it', () => {
    for (const relative of GRIEVANCE_SURFACES) {
      const source = readSurface(relative);
      expect(source).toContain('GRIEVANCE_OFFICER_NAME');
      expect(source).toContain('dpdpGrievance');
    }
  });

  it('leaves the officer to the policy pages rather than the footer', () => {
    const { container } = render(<MarketingFooter />);
    const text = container.querySelector('.agi-ds-footer-legal')?.textContent ?? '';

    expect(text).not.toMatch(new RegExp(GRIEVANCE_OFFICER_ROLE, 'i'));
  });

  it.each(GRIEVANCE_SURFACES)('reads the officer from the seam in %s', (relative) => {
    const source = readSurface(relative);

    expect(source).toContain('GRIEVANCE_OFFICER_NAME');
    expect(source).not.toContain(`${GRIEVANCE_OFFICER_ROLE}, ${LEGAL_ENTITY}`);
  });

  it.each(GRIEVANCE_SURFACES)('publishes no unprovisioned mailbox in %s', (relative) => {
    const mailboxes = readSurface(relative).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g);

    expect((mailboxes ?? []).filter((mailbox) => mailbox !== CONTACT_EMAIL)).toEqual([]);
  });
});
