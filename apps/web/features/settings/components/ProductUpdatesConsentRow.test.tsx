import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf-test-token',
  })),
}));

import { PRODUCT_UPDATES_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE } from '@/lib/consent-signals';
import { ProductUpdatesConsentRow } from './ProductUpdatesConsentRow';

const NOTICE_VERSION = 'notice-on-screen';

function ledger(granted: boolean | null) {
  return {
    noticeVersion: NOTICE_VERSION,
    consents:
      granted === null
        ? []
        : [
            { purpose: 'product_analytics', granted: !granted, noticeVersion: 'other' },
            { purpose: PRODUCT_UPDATES_CONSENT_PURPOSE.id, granted, noticeVersion: NOTICE_VERSION },
          ],
  };
}

function account(initial: boolean | null, save: () => Response = () => Response.json({})) {
  let granted = initial;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json(ledger(granted));
    const response = save();
    if (response.ok) {
      const body = JSON.parse(init.body as string) as { decisions: { granted: boolean }[] };
      granted = body.decisions[0]?.granted ?? granted;
    }
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function posts(fetchMock: ReturnType<typeof account>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => ({
      url,
      headers: init?.headers,
      body: JSON.parse(init?.body as string) as unknown,
    }));
}

function choice(): HTMLElement {
  return screen.getByRole('switch', { name: PRODUCT_UPDATES_CONSENT_PURPOSE.label });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'globalPrivacyControl');
});

describe('product updates choice in settings', () => {
  it('states the purpose in its canonical words', async () => {
    account(null);
    render(<ProductUpdatesConsentRow />);

    expect(screen.getByText(PRODUCT_UPDATES_CONSENT_PURPOSE.label)).toBeVisible();
    expect(screen.getByText(PRODUCT_UPDATES_CONSENT_PURPOSE.description)).toBeVisible();
    await waitFor(() => expect(choice()).toBeEnabled());
  });

  it('announces loading until the choice is available', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    );
    render(<ProductUpdatesConsentRow />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading your product updates choice');
    expect(choice()).toBeDisabled();

    finish(Response.json(ledger(null)));

    await waitFor(() => expect(choice()).toBeEnabled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the choice disabled and says so after a read failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    render(<ProductUpdatesConsentRow />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your product updates choice could not be loaded.',
    );
    expect(choice()).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    ['an account never asked', null],
    ['an account that refused', false],
  ])('is off for %s', async (_case, initial) => {
    account(initial);
    render(<ProductUpdatesConsentRow />);

    await waitFor(() => expect(choice()).toBeEnabled());
    expect(choice()).not.toBeChecked();
  });

  it('records a grant from settings against the notice version it read, and shows it saved', async () => {
    const fetchMock = account(null);
    render(<ProductUpdatesConsentRow />);
    await waitFor(() => expect(choice()).toBeEnabled());

    await userEvent.click(choice());

    await waitFor(() => expect(choice()).toBeChecked());
    expect(posts(fetchMock)).toEqual([
      {
        url: '/api/consent',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'csrf-test-token' },
        body: {
          decisions: [{ purpose: PRODUCT_UPDATES_CONSENT_PURPOSE.id, granted: true }],
          surface: 'web-settings',
          noticeVersion: NOTICE_VERSION,
        },
      },
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(choice()).toBeEnabled();
  });

  it('records a withdrawal as a new refusal, never as an edit', async () => {
    const fetchMock = account(true);
    render(<ProductUpdatesConsentRow />);
    await waitFor(() => expect(choice()).toBeChecked());

    await userEvent.click(choice());

    await waitFor(() => expect(choice()).not.toBeChecked());
    expect(posts(fetchMock).map((post) => post.body)).toEqual([
      {
        decisions: [{ purpose: PRODUCT_UPDATES_CONSENT_PURPOSE.id, granted: false }],
        surface: 'web-settings',
        noticeVersion: NOTICE_VERSION,
      },
    ]);
  });

  it.each([
    [500, 'That change was not saved. Try again.'],
    [409, 'The privacy notice changed. Review it and choose again.'],
  ])('keeps the recorded choice and says why when the save answers %i', async (status, message) => {
    account(null, () => new Response('{}', { status }));
    render(<ProductUpdatesConsentRow />);
    await waitFor(() => expect(choice()).toBeEnabled());

    await userEvent.click(choice());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(choice()).not.toBeChecked();
    expect(choice()).toBeEnabled();
  });

  it('says the change was not saved when the request never reaches the server', async () => {
    const fetchMock = account(null);
    render(<ProductUpdatesConsentRow />);
    await waitFor(() => expect(choice()).toBeEnabled());
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await userEvent.click(choice());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That change was not saved. Try again.',
    );
    expect(choice()).not.toBeChecked();
  });

  describe('under Global Privacy Control', () => {
    function signal() {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: true,
      });
    }

    it('cannot be turned on, and says why instead of saving a grant that would be refused', async () => {
      signal();
      const fetchMock = account(null);
      render(<ProductUpdatesConsentRow />);

      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
      expect(choice()).toBeDisabled();
      expect(choice()).not.toBeChecked();
      expect(screen.getByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeVisible();

      await userEvent.click(choice());

      expect(posts(fetchMock)).toEqual([]);
    });

    it('says why when only the request carried the signal and the grant was stored as a refusal', async () => {
      const fetchMock = account(null);
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? Response.json({
              recorded: [
                { purpose: 'product_analytics', granted: true },
                { purpose: PRODUCT_UPDATES_CONSENT_PURPOSE.id, granted: false },
              ],
            })
          : Response.json(ledger(false)),
      );
      render(<ProductUpdatesConsentRow />);
      await waitFor(() => expect(choice()).toBeEnabled());
      expect(screen.queryByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeNull();

      await userEvent.click(choice());

      expect(await screen.findByRole('status')).toHaveTextContent(
        GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE,
      );
      expect(posts(fetchMock).map((post) => post.body)).toMatchObject([
        { decisions: [{ purpose: PRODUCT_UPDATES_CONSENT_PURPOSE.id, granted: true }] },
      ]);
      await waitFor(() => expect(choice()).toBeDisabled());
      expect(choice()).not.toBeChecked();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('can still be withdrawn by an account that granted it elsewhere', async () => {
      signal();
      const fetchMock = account(true);
      render(<ProductUpdatesConsentRow />);
      await waitFor(() => expect(choice()).toBeChecked());
      expect(choice()).toBeEnabled();

      await userEvent.click(choice());

      await waitFor(() => expect(choice()).not.toBeChecked());
      expect(posts(fetchMock).map((post) => post.body)).toMatchObject([
        { decisions: [{ purpose: PRODUCT_UPDATES_CONSENT_PURPOSE.id, granted: false }] },
      ]);
      expect(choice()).toBeDisabled();
    });
  });

  it('says nothing about the signal when the grant was stored as asked', async () => {
    account(null, () =>
      Response.json({
        recorded: [{ purpose: PRODUCT_UPDATES_CONSENT_PURPOSE.id, granted: true }],
      }),
    );
    render(<ProductUpdatesConsentRow />);
    await waitFor(() => expect(choice()).toBeEnabled());

    await userEvent.click(choice());

    await waitFor(() => expect(choice()).toBeChecked());
    expect(choice()).toBeEnabled();
    expect(screen.queryByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeNull();
  });

  it('says nothing about the signal when the browser sends none', async () => {
    account(null);
    render(<ProductUpdatesConsentRow />);

    await waitFor(() => expect(choice()).toBeEnabled());
    expect(screen.queryByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeNull();
  });
});
