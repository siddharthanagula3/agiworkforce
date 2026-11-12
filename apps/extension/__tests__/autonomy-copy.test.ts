import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { approvalRequirement } from '../src/features/computer-use/approvalPolicy';
import { UNAPPROVED_SITE_DEFAULT_HINT } from '../src/features/options/site-permission-policy';
import catalog from '../_locales/en/messages.json';

const messages = catalog as Record<string, { message: string }>;
const listing = readFileSync(resolve(process.cwd(), 'docs/chrome-web-store-listing.md'), 'utf8');
const agentLoop = readFileSync(
  resolve(process.cwd(), 'src/features/computer-use/agentLoop.ts'),
  'utf8',
);

const PURCHASE_COPY: Array<[string, string]> = [
  ['spAutonomyAutoTooltip', messages['spAutonomyAutoTooltip']!.message],
  ['spAutonomyAutoDescription', messages['spAutonomyAutoDescription']!.message],
  ['spAutonomyFullAccessTooltip', messages['spAutonomyFullAccessTooltip']!.message],
  ['spFullAccessNotice', messages['spFullAccessNotice']!.message],
  ['the unapproved-site hint', UNAPPROVED_SITE_DEFAULT_HINT],
];

describe('what the autonomy copy says about purchases', () => {
  it('matches the code, which classifies a checkout button as a purchase and refuses it', () => {
    const requirement = approvalRequirement({
      toolName: 'click',
      args: { index: 3 },
      pageUrl: 'https://shop.example/cart',
      targetSignature: 'button|button|submit||Place order',
    });
    expect(requirement).toMatchObject({ alwaysAsk: true, reason: 'purchase' });
    expect(agentLoop).toMatch(/requirement\.reason === 'purchase'[\s\S]{0,80}PURCHASE_REFUSAL/);
  });

  it.each(PURCHASE_COPY)('%s never promises to ask before a purchase', (_name, copy) => {
    expect(copy).toMatch(/never completes? a purchase/i);
    expect(copy).not.toMatch(
      /\b(ask|asks|stops and asks)\b[^.]*\b(buy|buys|buying|pay|pays|purchases)\b/i,
    );
  });

  it('says the same in the store listing', () => {
    expect(listing).toContain('the assistant never completes a purchase');
    expect(listing).not.toMatch(/asks before anything important such as buying/);
    expect(listing).not.toMatch(/uploads, downloads, sign-ins, purchases/);
  });
});

describe('what the welcome page says AGI will not do', () => {
  it('does not promise to refuse a password or payment field the code asks about', () => {
    const requirement = approvalRequirement({
      toolName: 'type',
      args: { index: 2, text: 'secret' },
      pageUrl: 'https://login.example/',
      targetSignature: 'input|input|password||Password',
    });
    expect(requirement).toMatchObject({ alwaysAsk: true, reason: 'sensitive_input' });
    expect(messages['welcomeCannot2']!.message).toBe(
      'Type a password or payment detail without asking you first.',
    );
  });
});
