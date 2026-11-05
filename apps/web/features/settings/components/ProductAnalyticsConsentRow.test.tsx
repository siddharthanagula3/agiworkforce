import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
  readProductAnalyticsConsent,
} from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({ applyLocally: vi.fn() }));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));
vi.mock('@shared/lib/cookie-consent', async (importOriginal) => ({
  ...(await importOriginal()),
  applyAnalyticsConsentLocally: (...args: unknown[]) => mocks.applyLocally(...args),
}));

import { GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE } from '@/lib/consent-signals';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { ProductAnalyticsConsentRow } from './ProductAnalyticsConsentRow';
import { AccountConsentRow } from './AccountConsentRow';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.applyLocally.mockReset();
});

describe('account consent withdrawal phases', () => {
  it.each(['confirmed', 'invalid', 'upgraded', 'http409', 'http500', 'network'] as const)(
    'separates explicit refusal from the %s server outcome',
    async (outcome) => {
      const onWithdrawalRequested = vi.fn();
      const onSaved = vi.fn();
      let releaseCsrf!: (headers: Record<string, string>) => void;
      vi.mocked(addCsrfHeaders).mockReturnValueOnce(
        new Promise((resolve) => {
          releaseCsrf = resolve;
        }),
      );
      let finishPost!: (response: Response) => void;
      let failPost!: (error: Error) => void;
      const pendingPost = new Promise<Response>((resolve, reject) => {
        finishPost = resolve;
        failPost = reject;
      });
      let reads = 0;
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') return pendingPost;
        reads += 1;
        return Response.json({
          noticeVersion: 'test-version',
          consents: [
            {
              purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE,
              granted: reads === 1 || outcome !== 'confirmed',
              noticeVersion: PRODUCT_ANALYTICS_NOTICE_VERSION,
            },
          ],
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <AccountConsentRow
          purpose={PRODUCT_ANALYTICS_CONSENT_PURPOSE}
          label="Analytics test choice"
          description="Analytics test description"
          loadingLabel="Loading test choice"
          unavailableLabel="Test choice unavailable"
          readGranted={readProductAnalyticsConsent}
          onWithdrawalRequested={onWithdrawalRequested}
          onSaved={onSaved}
        />,
      );
      await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());

      await userEvent.click(screen.getByRole('switch'));

      expect(onWithdrawalRequested).toHaveBeenCalledTimes(1);
      expect(onSaved).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('switch')).toBeDisabled();

      releaseCsrf({ 'Content-Type': 'application/json' });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(onSaved).not.toHaveBeenCalled();
      if (outcome === 'network') {
        failPost(new TypeError('Failed to fetch'));
      } else {
        finishPost(
          Response.json(
            outcome === 'invalid'
              ? {}
              : {
                  recorded: [
                    {
                      purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE,
                      granted: outcome === 'upgraded',
                    },
                  ],
                },
            { status: outcome === 'http409' ? 409 : outcome === 'http500' ? 500 : 200 },
          ),
        );
      }

      await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
      expect(onWithdrawalRequested).toHaveBeenCalledTimes(1);
      expect(onSaved.mock.calls).toEqual(outcome === 'confirmed' ? [[false]] : []);
      expect(fetchMock).toHaveBeenCalledTimes(outcome === 'network' ? 2 : 3);
      expect(screen.queryByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeNull();
      if (outcome === 'invalid' || outcome === 'upgraded') {
        expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm that change was saved.');
      }
      if (outcome === 'confirmed') expect(screen.queryByRole('alert')).toBeNull();
    },
  );
});

describe('product analytics choice loading', () => {
  it('announces loading until the privacy choice is available', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    );
    render(<ProductAnalyticsConsentRow />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your product analytics choice');
    expect(screen.getByRole('switch')).toBeDisabled();
    finish(new Response(JSON.stringify({ noticeVersion: 'test-version' }), { status: 200 }));
    expect(await screen.findByRole('switch')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clears loading and keeps the choice disabled after a read failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    render(<ProductAnalyticsConsentRow />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your product analytics choice could not be loaded.',
    );
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('product analytics choice saving', () => {
  function account(stored: (asked: boolean) => boolean) {
    let granted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method !== 'POST') {
          return Response.json({
            noticeVersion: 'test-version',
            consents: [
              {
                purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE,
                granted,
                noticeVersion: PRODUCT_ANALYTICS_NOTICE_VERSION,
              },
            ],
          });
        }
        const body = JSON.parse(init.body as string) as { decisions: { granted: boolean }[] };
        granted = stored(body.decisions[0]?.granted === true);
        return Response.json({
          recorded: [{ purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE, granted }],
        });
      }),
    );
  }

  it('applies a grant in this browser once the account has stored it', async () => {
    account((asked) => asked);
    render(<ProductAnalyticsConsentRow />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());

    await userEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
    expect(mocks.applyLocally).toHaveBeenCalledTimes(1);
    expect(mocks.applyLocally).toHaveBeenCalledWith(true);
    expect(screen.queryByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeNull();
  });

  it('applies the refusal the account stored, and says why, when a grant is refused under Global Privacy Control', async () => {
    account(() => false);
    render(<ProductAnalyticsConsentRow />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());

    await userEvent.click(screen.getByRole('switch'));

    expect(await screen.findByRole('status')).toHaveTextContent(
      GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE,
    );
    expect(mocks.applyLocally).toHaveBeenCalledTimes(1);
    expect(mocks.applyLocally).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.getByRole('switch')).toBeDisabled());
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('applies a withdrawal at the user intent and confirmed receipt phases', async () => {
    account((asked) => asked);
    render(<ProductAnalyticsConsentRow />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    await userEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
    mocks.applyLocally.mockClear();

    await userEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked());
    expect(mocks.applyLocally.mock.calls).toEqual([[false], [false]]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('product analytics save confirmation', () => {
  const decision = { purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE, granted: true };

  function ledger(granted: boolean) {
    return Response.json({
      noticeVersion: 'test-version',
      consents: [{ ...decision, granted, noticeVersion: PRODUCT_ANALYTICS_NOTICE_VERSION }],
    });
  }

  function responses(receipt: Response, reconciled: Response, initial = false) {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ledger(initial))
      .mockResolvedValueOnce(receipt)
      .mockResolvedValueOnce(reconciled);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it.each([
    ['empty body', () => new Response(null, { status: 204 })],
    ['invalid JSON', () => new Response('{')],
    ['null body', () => Response.json(null)],
    ['missing recorded', () => Response.json({})],
    ['nonarray recorded', () => Response.json({ recorded: 1 })],
    ['empty recorded', () => Response.json({ recorded: [] })],
    ['null decision', () => Response.json({ recorded: [null] })],
    ['primitive decision', () => Response.json({ recorded: [true] })],
    [
      'wrong purpose',
      () => Response.json({ recorded: [{ ...decision, purpose: 'marketing_email' }] }),
    ],
    ['missing grant', () => Response.json({ recorded: [{ purpose: decision.purpose }] })],
    ['nonboolean grant', () => Response.json({ recorded: [{ ...decision, granted: 'true' }] })],
    ['duplicate decisions', () => Response.json({ recorded: [decision, decision] })],
    [
      'conflicting decisions',
      () => Response.json({ recorded: [decision, { ...decision, granted: false }] }),
    ],
    [
      'additional purpose',
      () =>
        Response.json({
          recorded: [decision, { purpose: 'marketing_email', granted: false }],
        }),
    ],
  ])('does not apply or infer a refusal from %s', async (_name, receipt) => {
    const fetchMock = responses(receipt(), ledger(false));
    render(<ProductAnalyticsConsentRow />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());

    await userEvent.click(screen.getByRole('switch'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not confirm that change was saved.',
    );
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]).toEqual({ credentials: 'same-origin' });
    expect(mocks.applyLocally).not.toHaveBeenCalled();
    expect(screen.queryByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeNull();
  });

  it('reconciles an unconfirmed save to a recorded grant without applying it locally', async () => {
    responses(Response.json({}), ledger(true));
    render(<ProductAnalyticsConsentRow />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());

    await userEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm that change was saved.');
    expect(mocks.applyLocally).not.toHaveBeenCalled();
  });

  it.each(['missing', 'upgraded'] as const)(
    'keeps explicit local refusal with a %s withdrawal receipt',
    async (receipt) => {
      responses(
        Response.json(receipt === 'missing' ? {} : { recorded: [decision] }),
        ledger(false),
        true,
      );
      render(<ProductAnalyticsConsentRow />);
      await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());

      await userEvent.click(screen.getByRole('switch'));

      await waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked());
      expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm that change was saved.');
      expect(mocks.applyLocally.mock.calls).toEqual([[false]]);
      expect(screen.queryByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeNull();
    },
  );

  it('keeps uncertainty visible if reconciliation also fails', async () => {
    const fetchMock = responses(Response.json({}), new Response(null, { status: 503 }));
    render(<ProductAnalyticsConsentRow />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());

    await userEvent.click(screen.getByRole('switch'));

    expect(await screen.findByText('Your product analytics choice could not be loaded.')).toBeVisible();
    expect(screen.getByText('Could not confirm that change was saved.')).toBeVisible();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mocks.applyLocally).not.toHaveBeenCalled();
    expect(screen.queryByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeNull();
  });

  it.each([409, 500])('does not apply a decision from an HTTP %i response', async (status) => {
    responses(Response.json({ recorded: [decision] }, { status }), ledger(false));
    render(<ProductAnalyticsConsentRow />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());

    await userEvent.click(screen.getByRole('switch'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      status === 409
        ? 'The privacy notice changed. Review it and choose again.'
        : 'That change was not saved. Try again.',
    );
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    expect(mocks.applyLocally).not.toHaveBeenCalled();
  });
});
