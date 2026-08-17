import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RUNBOOK_PATH = path.join(REPO_ROOT, 'BREACH_RUNBOOK.md');
const FOUNDER_TRACKER = 'FoundersAssistance.md';
const FOUNDER_TRACKER_PATH = path.join(REPO_ROOT, FOUNDER_TRACKER);

const RUNBOOK = readFileSync(RUNBOOK_PATH, 'utf8');
const TRACKER = readFileSync(FOUNDER_TRACKER_PATH, 'utf8');

const PENDING = 'pending-counsel';
const APPROVED = 'counsel-approved';

const TEMPLATE_HEADINGS = [
  '## 4. Board notification template',
  '## 5. Data Principal notification template',
];

function reviewStatus(): string {
  const match = RUNBOOK.match(/^Legal review:\s*(\S+)\s*$/m);
  if (!match) {
    throw new Error(
      `BREACH_RUNBOOK.md must carry a "Legal review:" header field set to ${PENDING} or ${APPROVED}`,
    );
  }
  return match[1]!;
}

function sectionBody(heading: string): string {
  const start = RUNBOOK.indexOf(heading);
  expect(start, `${RUNBOOK_PATH} must contain the section "${heading}"`).toBeGreaterThan(-1);
  const after = RUNBOOK.slice(start + heading.length);
  const next = after.search(/^## /m);
  return next === -1 ? after : after.slice(0, next);
}

function templateStart(body: string): number {
  const index = body.search(/^> /m);
  expect(index, 'each template section must contain a blockquoted template body').toBeGreaterThan(
    -1,
  );
  return index;
}

function normalize(text: string): string {
  return text.replace(/\s+/gu, ' ');
}

function trackerEntryNaming(needle: string): string | null {
  const sections = TRACKER.split(/^## /m).slice(1);
  return sections.find((section) => section.includes(needle)) ?? null;
}

describe('breach runbook counsel gate', () => {
  it('declares a legal review status that is one of the two defined states', () => {
    expect([PENDING, APPROVED]).toContain(reviewStatus());
  });

  it.each(TEMPLATE_HEADINGS)(
    'warns before the template body in "%s" while review is pending',
    (heading) => {
      if (reviewStatus() !== PENDING) return;
      const body = sectionBody(heading);
      const preamble = normalize(body.slice(0, templateStart(body)));
      expect(
        preamble,
        `${heading} must warn that the template is unreviewed before the template itself, not only in the file header`,
      ).toContain(`Legal review: ${PENDING} — this template has not been reviewed by a lawyer.`);
    },
  );

  it.each(TEMPLATE_HEADINGS)(
    'tells the reader in "%s" that the warning does not delay a live notification',
    (heading) => {
      if (reviewStatus() !== PENDING) return;
      const preamble = normalize(sectionBody(heading));
      expect(
        preamble,
        `${heading} must say the statutory clock does not pause for legal review, or the warning becomes a reason to miss it`,
      ).toContain('This is not a hold on sending.');
    },
  );

  it('records who approved and when once review is no longer pending', () => {
    if (reviewStatus() !== APPROVED) return;
    expect(
      /^Approved by:\s*\S.*\S\s*$/m.test(RUNBOOK),
      'flipping Legal review to counsel-approved requires an "Approved by:" line naming the reviewer and the date',
    ).toBe(true);
  });

  it('drops the pending warnings once review is no longer pending', () => {
    if (reviewStatus() !== APPROVED) return;
    for (const heading of TEMPLATE_HEADINGS) {
      expect(
        normalize(sectionBody(heading)),
        `${heading} must not keep the ${PENDING} warning after counsel has approved it`,
      ).not.toContain('has not been reviewed by a lawyer');
    }
  });

  it('stops claiming the runbook is unreviewed in its header once review is no longer pending', () => {
    if (reviewStatus() !== APPROVED) return;
    const header = RUNBOOK.slice(0, RUNBOOK.indexOf('---'));
    expect(
      normalize(header),
      'the Status line must not still call the runbook unreviewed after counsel has approved it',
    ).not.toContain('not reviewed by counsel');
  });

  it('lists the unreviewed templates as an open gap rather than burying the status', () => {
    if (reviewStatus() !== PENDING) return;
    const gaps = sectionBody('## Open gaps');
    expect(gaps).toContain('has not been reviewed by counsel');
    expect(gaps).toContain(FOUNDER_TRACKER);
  });

  it(`resolves the ${FOUNDER_TRACKER} founder action the open gap points at`, () => {
    if (reviewStatus() !== PENDING) return;
    expect(sectionBody('## Open gaps')).toContain(FOUNDER_TRACKER);
    const entry = trackerEntryNaming('BREACH_RUNBOOK.md');
    expect(
      entry,
      `the Open gaps table says counsel review is tracked in ${FOUNDER_TRACKER}, so that file must carry an entry naming BREACH_RUNBOOK.md — otherwise the review nobody can do in code is tracked nowhere`,
    ).not.toBeNull();
    const body = normalize(entry ?? '');
    expect(body, 'the founder entry must cover both unreviewed templates').toContain('§4');
    expect(body, 'the founder entry must cover both unreviewed templates').toContain('§5');
    expect(
      body,
      'the founder entry must name the header field that records approval, or sign-off cannot be applied',
    ).toContain(APPROVED);
    expect(
      body,
      'the founder entry must repeat that the statutory clock does not pause, or it reads as a hold on notifying',
    ).toContain('This is not a hold on sending.');
  });
});
