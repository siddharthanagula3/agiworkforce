import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
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
import { ProductAnalyticsConsentRow } from './ProductAnalyticsConsentRow';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.applyLocally.mockReset();
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
});
