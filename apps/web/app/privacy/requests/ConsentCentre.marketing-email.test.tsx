import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import {
  CONSENT_PURPOSES,
  MARKETING_EMAIL_CONSENT_PURPOSE,
  findConsentPurpose,
} from '@/lib/consent-purposes';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { ConsentCentre } from './ConsentCentre';

const NOTICE_ON_SCREEN = POLICY_LAST_UPDATED.privacy;
const RECORDED_ON = '2026-10-05';

interface StoredConsent {
  purpose: string;
  granted: boolean;
  surface?: string;
}

interface PostedDecision {
  decisions: { purpose: string; granted: boolean }[];
  surface: string;
  noticeVersion: string;
}

function account(initial: StoredConsent[]): PostedDecision[] {
  const latest = new Map(initial.map((entry) => [entry.purpose, entry]));
  const posted: PostedDecision[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/api/consent') throw new Error(`unexpected fetch ${String(input)}`);
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as PostedDecision;
        posted.push(body);
        for (const decision of body.decisions) {
          latest.set(decision.purpose, { ...decision, surface: body.surface });
        }
        return Response.json({ recorded: body.decisions, noticeVersion: NOTICE_ON_SCREEN });
      }
      return Response.json({
        noticeVersion: NOTICE_ON_SCREEN,
        purposes: CONSENT_PURPOSES,
        consents: [...latest.values()].map((entry) => ({
          purpose: entry.purpose,
          granted: entry.granted,
          noticeVersion: NOTICE_ON_SCREEN,
          surface: entry.surface ?? 'web-signup',
          recordedAt: `${RECORDED_ON}T00:00:00.000Z`,
        })),
      });
    }),
  );
  return posted;
}

function rowOf(purposeId: string): HTMLElement {
  const purpose = findConsentPurpose(purposeId);
  if (!purpose) throw new Error(`no consent purpose ${purposeId}`);
  const row = screen.getByText(purpose.description).closest<HTMLElement>('td, li, div');
  if (!row) throw new Error(`no consent row for ${purposeId}`);
  return row;
}

function buttonOf(purposeId: string): HTMLButtonElement {
  const button = rowOf(purposeId).querySelector('button');
  if (!button) throw new Error(`no consent button for ${purposeId}`);
  return button;
}

async function press(purposeId: string): Promise<void> {
  await act(async () => {
    fireEvent.click(buttonOf(purposeId));
  });
}

const MARKETING_EMAIL = MARKETING_EMAIL_CONSENT_PURPOSE.id;
const PRODUCT_UPDATES = 'product_updates';

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'globalPrivacyControl');
});

describe('marketing email in the consent centre', () => {
  it('is listed by itself, in its own words, beside the waitlist product updates', async () => {
    account([]);

    render(<ConsentCentre optedOutBySignal={false} />);

    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Give consent'));
    expect(screen.getByText(MARKETING_EMAIL_CONSENT_PURPOSE.label)).toBeVisible();
    expect(rowOf(MARKETING_EMAIL)).not.toBe(rowOf(PRODUCT_UPDATES));
    expect(rowOf(MARKETING_EMAIL)).toHaveTextContent(
      'Never asked. No decision is on record, which is not the same as a refusal.',
    );
  });

  it('can be given there, recorded against the notice on screen as its own purpose', async () => {
    const posted = account([]);
    render(<ConsentCentre optedOutBySignal={false} />);
    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Give consent'));

    await press(MARKETING_EMAIL);

    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Withdraw consent'));
    expect(posted).toEqual([
      {
        decisions: [{ purpose: 'marketing_email', granted: true }],
        surface: 'web-consent-centre',
        noticeVersion: NOTICE_ON_SCREEN,
      },
    ]);
    expect(rowOf(MARKETING_EMAIL)).toHaveTextContent(
      `Consent given on ${RECORDED_ON}, against notice revision ${NOTICE_ON_SCREEN}.`,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Consent recorded.');
    expect(buttonOf(PRODUCT_UPDATES)).toHaveTextContent('Give consent');
  });

  it('shows a choice made at sign-up and withdraws it as a new refusal', async () => {
    const posted = account([{ purpose: MARKETING_EMAIL, granted: true, surface: 'web-signup' }]);
    render(<ConsentCentre optedOutBySignal={false} />);
    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Withdraw consent'));

    await press(MARKETING_EMAIL);

    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Give consent'));
    expect(posted).toEqual([
      {
        decisions: [{ purpose: 'marketing_email', granted: false }],
        surface: 'web-consent-centre',
        noticeVersion: NOTICE_ON_SCREEN,
      },
    ]);
    expect(rowOf(MARKETING_EMAIL)).toHaveTextContent(`Withdrawn on ${RECORDED_ON}`);
    expect(screen.getByRole('status')).toHaveTextContent('Withdrawal recorded.');
  });

  it('can be given again after a withdrawal', async () => {
    const posted = account([{ purpose: MARKETING_EMAIL, granted: false, surface: 'web-settings' }]);
    render(<ConsentCentre optedOutBySignal={false} />);
    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Give consent'));

    await press(MARKETING_EMAIL);
    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Withdraw consent'));
    await press(MARKETING_EMAIL);
    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Give consent'));

    expect(posted.map((entry) => entry.decisions)).toEqual([
      [{ purpose: 'marketing_email', granted: true }],
      [{ purpose: 'marketing_email', granted: false }],
    ]);
  });

  it('keeps the two email purposes apart: a waitlist grant is not an account grant, and withdrawing one leaves the other', async () => {
    const posted = account([
      { purpose: PRODUCT_UPDATES, granted: true, surface: 'web-waitlist-inline' },
      { purpose: MARKETING_EMAIL, granted: true, surface: 'web-signup' },
    ]);
    render(<ConsentCentre optedOutBySignal={false} />);
    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Withdraw consent'));

    await press(MARKETING_EMAIL);

    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Give consent'));
    expect(buttonOf(PRODUCT_UPDATES)).toHaveTextContent('Withdraw consent');
    expect(posted.flatMap((entry) => entry.decisions.map((decision) => decision.purpose))).toEqual([
      'marketing_email',
    ]);
  });

  it('shows an account with only a waitlist grant as never asked about marketing email', async () => {
    account([{ purpose: PRODUCT_UPDATES, granted: true, surface: 'web-waitlist-inline' }]);

    render(<ConsentCentre optedOutBySignal={false} />);

    await waitFor(() => expect(buttonOf(PRODUCT_UPDATES)).toHaveTextContent('Withdraw consent'));
    expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Give consent');
    expect(rowOf(MARKETING_EMAIL)).toHaveTextContent('Never asked.');
  });
});

describe('marketing email in the consent centre under Global Privacy Control', () => {
  it.each([
    ['the request carried the signal', true, false],
    ['the browser property is set', false, true],
  ])('cannot be given when %s, and says why', async (_case, byRequest, byBrowser) => {
    if (byBrowser) {
      Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
    }
    const posted = account([]);

    render(<ConsentCentre optedOutBySignal={byRequest} />);

    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toBeDisabled());
    expect(rowOf(MARKETING_EMAIL)).toHaveTextContent(/sending Global Privacy Control/);
    await press(MARKETING_EMAIL);
    expect(posted).toEqual([]);
  });

  it('can still be withdrawn, which agrees with the signal', async () => {
    const posted = account([{ purpose: MARKETING_EMAIL, granted: true, surface: 'web-signup' }]);
    render(<ConsentCentre optedOutBySignal={true} />);
    await waitFor(() => expect(buttonOf(MARKETING_EMAIL)).toHaveTextContent('Withdraw consent'));
    expect(buttonOf(MARKETING_EMAIL)).toBeEnabled();

    await press(MARKETING_EMAIL);

    expect(posted.map((entry) => entry.decisions)).toEqual([
      [{ purpose: 'marketing_email', granted: false }],
    ]);
  });
});
