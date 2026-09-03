import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { policySectionId } from '@shared/components/legal/PolicyContents';
import { CANONICAL_POLICY_ROUTES, CONTACT_SUBJECTS } from '@/lib/legal-constants';

const DPA_PATH = path.join(__dirname, '..', 'dpa', 'page.tsx');

function source(): string {
  return readFileSync(DPA_PATH, 'utf8');
}

function flat(): string {
  return source().replace(/\s+/gu, ' ');
}

function sections(): string[] {
  const block = /const SECTIONS = \[([\s\S]*?)\] as const;/.exec(source());
  return [...(block?.[1] ?? '').matchAll(/'([^']+)'/gu)].map((match) => match[1] as string);
}

function sectionBody(id: string): string {
  const start = source().indexOf(`id="${id}"`);
  expect(start, `the DPA must render a section with id ${id}`).toBeGreaterThan(-1);
  const after = source().slice(start);
  const end = after.indexOf('</section>');
  return after.slice(0, end === -1 ? undefined : end).replace(/\s+/gu, ' ');
}

describe('DPA, DPDP Act coverage', () => {
  it('names the DPDP Act in the applicable-law definition', () => {
    const definitions = sectionBody('s-02');
    expect(definitions).toMatch(/Applicable Data Protection Law/);
    expect(
      definitions,
      'the applicable-law definition must name India’s DPDP Act, not only GDPR/UK/Swiss/CCPA',
    ).toMatch(/Digital Personal Data Protection Act, 2023/);
  });

  it('states the DPDP vocabulary instead of assuming controller/processor carries over', () => {
    const definitions = sectionBody('s-02');
    for (const term of ['Data Fiduciary', 'Data Processor', 'Data Principal']) {
      expect(definitions, `section 02 must map ${term}`).toContain(term);
    }
  });

  it('carries an India annex that is listed in the contents and anchored', () => {
    const listed = sections().filter((entry) => /DPDP Act, 2023/.test(entry));
    expect(listed, 'the contents must list the India (DPDP) annex').toHaveLength(1);
    const id = policySectionId(listed[0] as string);
    expect(source()).toContain(`id="${id}"`);
    const annex = sectionBody(id);
    expect(annex).toMatch(/Annex IV/);
    expect(annex).toMatch(/has not been reviewed by Indian counsel/);
    expect(annex).toContain(`contactMailto(CONTACT_SUBJECTS.dpdpGrievance)`);
    expect(annex).toContain('CANONICAL_POLICY_ROUTES.indiaPrivacy');
  });

  it('allocates the Act’s duties rather than leaving them implied', () => {
    const flattened = flat();
    for (const duty of [
      'Notice and consent (ss. 5–6)',
      'Erasure on withdrawal or purpose end (s. 8(7))',
      'Data Principal rights (ss. 11–14)',
      'Breach intimation (s. 8(6))',
      'Transfer outside India (s. 16)',
      'Significant Data Fiduciary (s. 10)',
      'Children (s. 9)',
    ]) {
      expect(flattened, `the India annex must allocate: ${duty}`).toContain(duty);
    }
    expect(flattened, 'the annex must name the s. 8(2) processor-contract requirement').toMatch(
      /s\. 8\(2\)/,
    );
  });

  it('commits to notifying affected individuals, not only the enterprise Customer', () => {
    const breach = sectionBody('s-10');
    expect(breach).toMatch(/notifies the Customer without undue delay/);
    expect(
      breach,
      'section 10 must commit to data-principal notification where AGI is the Data Fiduciary',
    ).toMatch(/notifies each affected individual directly/);
    expect(breach).toMatch(/Data Protection Board of India/);
    expect(
      breach,
      'section 10 must say AGI will deliver the notice on the Customer’s written instruction',
    ).toMatch(/instructs AGI in writing to deliver the notice/);
    expect(
      breach,
      'the Act has no low-risk exception and no public-notice substitution; the DPA must not imply one',
    ).toMatch(/no low-risk exception/);
  });

  it('states the delivery limit instead of promising a breach email broadcast', () => {
    const breach = sectionBody('s-10');
    expect(breach).toMatch(/in-product on next sign-in/);
    expect(breach).toMatch(/dated public notice at a stable URL/);
    expect(breach).not.toMatch(/there is no transactional email (system|provider)/i);
    expect(breach).not.toMatch(/we do not operate a transactional email/i);
  });

  it('keeps the India surfaces reachable from the DPA', () => {
    const flattened = flat();
    expect(flattened).toContain('/privacy/india');
    expect(CANONICAL_POLICY_ROUTES.indiaPrivacy).toBe('/privacy/india');
    expect(CONTACT_SUBJECTS.dpdpGrievance).toBe('DPDP grievance');
  });
});
