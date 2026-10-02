import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RUNBOOK_FILE = 'docs/runbooks/free-quota-models.md';
const RUNBOOK_LINES = readFileSync(path.join(REPO_ROOT, RUNBOOK_FILE), 'utf8').split('\n');

const CUSTOMER_AGREEMENT = 'https://www.qwencloud.com/legal/agreement';
const MEMBERSHIP_AGREEMENT =
  'https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-membership-agreement';
const TERMS_RESTED_ON = '### The terms it rests on';
const OPEN_CLAUSES_TITLE = 'Clauses the launch review did not settle';
const OPEN_CLAUSES = `#### ${OPEN_CLAUSES_TITLE}`;
const READ_ON = 'read on 2026-10-02';

function section(heading: string): string {
  const level = heading.indexOf(' ');
  const start = RUNBOOK_LINES.indexOf(heading);
  expect(start, `${RUNBOOK_FILE} must contain the section "${heading}"`).toBeGreaterThan(-1);
  const end = RUNBOOK_LINES.findIndex((line, index) => {
    const marker = /^(#+) /.exec(line)?.[1];
    return index > start && marker !== undefined && marker.length <= level;
  });
  return RUNBOOK_LINES.slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .replace(/\s+/gu, ' ');
}

describe('the free quota terms review record', () => {
  it('quotes the general restrictions of both agreements among the terms the review rests on', () => {
    const terms = section(TERMS_RESTED_ON);

    expect(terms).toContain(CUSTOMER_AGREEMENT);
    expect(terms).toContain(MEMBERSHIP_AGREEMENT);
    expect(terms).toContain('"You shall not (whether through your End Users or otherwise):"');
    expect(terms).toContain(
      '"access or use the Services in a way intended to avoid the relevant fees or charges;"',
    );
    expect(terms).toContain('"resell or sublicense any Services;"');
  });

  it('quotes each resale clause whole, with its bar on competing products', () => {
    const terms = section('## Terms review');

    expect(terms).toContain(
      'to train or develop products or services that compete with us and/or our affiliates’ products and services, unless expressly authorised by us."',
    );
    expect(terms).toContain(
      'to train or develop products or services that compete with Alibaba Cloud and/or its affiliates’ products and services, unless expressly authorised by us."',
    );
    expect(terms).not.toMatch(/only resale/);
  });

  it('leaves the fees clause to the owner or a lawyer instead of settling it', () => {
    const open = section(OPEN_CLAUSES);

    expect(open).toContain('questions for the owner or a lawyer, not settled points');
    expect(open).toContain('§3.2(j)');
  });

  it('names where and when each quoted general restriction was read, beside the quote', () => {
    const open = section(OPEN_CLAUSES);

    expect(open).toContain(CUSTOMER_AGREEMENT);
    expect(open).toContain(MEMBERSHIP_AGREEMENT);
    expect(open).toContain(READ_ON);
  });

  it('re-reads both general agreements and the open questions at every renewal', () => {
    const renewal = section('### Renewing it');

    expect(renewal).toContain('§3.2');
    expect(renewal).toContain('Membership Agreement');
    expect(renewal).toContain(OPEN_CLAUSES_TITLE);
  });
});
