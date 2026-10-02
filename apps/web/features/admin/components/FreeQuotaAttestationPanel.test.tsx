import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FREE_QUOTA_ATTESTATION_PATH,
  FreeQuotaAttestationStatusSchema,
  type FreeQuotaAttestationStatus,
} from '@agiworkforce/cloud-contracts';
import FreeQuotaAttestationPanel from './FreeQuotaAttestationPanel';

const DAY_MS = 24 * 60 * 60 * 1000;
const SERVER_NOW = Date.parse('2026-10-02T15:00:00.000Z');
const CLIENT_AHEAD_MS = 90_000;
const CSRF_TOKEN = 'csrf-fixture-token';

type ConfiguredStatus = Extract<FreeQuotaAttestationStatus, { configured: true }>;

const OFFERINGS: ConfiguredStatus['offerings'] = [
  {
    key: 'fixture-offering-chat',
    displayName: 'Fixture chat model',
    providerModelId: 'fixture-chat-model',
    category: 'chat',
    expiresOn: '2026-11-01',
    attested: true,
  },
  {
    key: 'fixture-offering-image',
    displayName: 'Fixture image model',
    providerModelId: 'fixture-image-model',
    category: 'image',
    expiresOn: null,
    attested: false,
  },
  {
    key: 'fixture-offering-video',
    displayName: 'Fixture video model',
    providerModelId: 'fixture-video-model',
    category: 'video',
    expiresOn: '2026-10-21',
    attested: true,
  },
];

const ALL_TERMS = {
  commercialUseAllowed: true,
  thirdPartyServingAllowed: true,
  proxyingAllowed: true,
  promptsExcludedFromTraining: true,
};

function review(
  overrides: Partial<NonNullable<ConfiguredStatus['termsReview']['review']>> = {},
): NonNullable<ConfiguredStatus['termsReview']['review']> {
  return {
    reviewedBy: 'fixture-reviewer',
    verifiedAtMs: SERVER_NOW - 10 * DAY_MS,
    expiresAtMs: SERVER_NOW + 80 * DAY_MS,
    evidenceUrl: 'https://example.com/terms-review-evidence',
    terms: ALL_TERMS,
    approvedOfferings: 97,
    ...overrides,
  };
}

function record(
  overrides: Partial<NonNullable<ConfiguredStatus['attestation']['record']>> = {},
): NonNullable<ConfiguredStatus['attestation']['record']> {
  return {
    checkedAtMs: SERVER_NOW - 5 * DAY_MS,
    freshUntilMs: SERVER_NOW + 25 * DAY_MS,
    offerings: 'all',
    boundToCurrentKey: true,
    attestedBy: 'user_fixture_operator',
    ...overrides,
  };
}

function configured(overrides: Partial<ConfiguredStatus> = {}): ConfiguredStatus {
  return FreeQuotaAttestationStatusSchema.parse({
    configured: true,
    nowMs: SERVER_NOW,
    issuer: 'QwenCloud',
    consolePage: 'https://home.qwencloud.com/benefits',
    validForMs: 30 * DAY_MS,
    recordWindowMs: 60 * 60 * 1000,
    reminderLeadMs: 3 * DAY_MS,
    termsReview: { standing: 'current', review: review() },
    attestation: { standing: 'current', record: record() },
    billingSignalAtMs: null,
    billingSignalUnreadable: false,
    withdrawn: [],
    offerings: OFFERINGS,
    serving: {
      ready: 82,
      total: 272,
      blocked: [
        { outcome: 'not_integrated', count: 175 },
        { outcome: 'media_not_served', count: 15 },
      ],
    },
    ...overrides,
  }) as ConfiguredStatus;
}

const NOTHING_SERVING: ConfiguredStatus['serving'] = {
  ready: 0,
  total: 272,
  blocked: [
    { outcome: 'not_integrated', count: 175 },
    { outcome: 'terms_review_missing', count: 91 },
    { outcome: 'quota_only_not_observed', count: 6 },
  ],
};

type Read = FreeQuotaAttestationStatus | { failWith: number };

interface Network {
  statuses: Read[];
  post: { status: number; body: unknown };
  posts: Array<{ headers: Record<string, string>; body: Record<string, unknown> }>;
}

let network: Network;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function serve(statuses: Read[], post?: Network['post']) {
  network = {
    statuses: [...statuses],
    post: post ?? {
      status: 200,
      body: {
        checkedAtMs: SERVER_NOW,
        freshUntilMs: SERVER_NOW + 30 * DAY_MS,
        offerings: OFFERINGS.length,
      },
    },
    posts: [],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/csrf') return json({ token: CSRF_TOKEN, expiresIn: DAY_MS });
      if (url !== FREE_QUOTA_ATTESTATION_PATH) {
        return json({ error: { message: 'Not found.' } }, 404);
      }
      if (init?.method === 'POST') {
        network.posts.push({
          headers: init.headers as Record<string, string>,
          body: JSON.parse(String(init.body)),
        });
        return json(network.post.body, network.post.status);
      }
      const next = network.statuses.length > 1 ? network.statuses.shift()! : network.statuses[0]!;
      return 'failWith' in next
        ? json({ error: { message: 'Service unavailable.' } }, next.failWith)
        : json(next);
    }),
  );
}

function statusReads(): number {
  return vi
    .mocked(fetch)
    .mock.calls.filter(
      ([input, init]) => String(input) === FREE_QUOTA_ATTESTATION_PATH && !init?.method,
    ).length;
}

async function confirmRecording(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: /I checked just now/ }));
  await user.click(screen.getByRole('button', { name: 'Record console check' }));
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Record check' }),
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(SERVER_NOW + CLIENT_AHEAD_MS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FreeQuotaAttestationPanel, reading the gates', () => {
  it('says it is reading before the status settles', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<FreeQuotaAttestationPanel />);

    expect(screen.getByText('Reading the free model gates…')).toBeInTheDocument();
  });

  it('names what the deployment is missing, says free models are off, and offers no record', async () => {
    serve([{ configured: false, sharedState: true, credential: false, inventory: true }]);
    render(<FreeQuotaAttestationPanel />);

    expect(await screen.findByText(/Free models are off/)).toHaveAttribute('data-tone', 'danger');
    const requirements = screen.getByText('Provider key (QWEN_API_KEY)').closest('dl');
    expect(requirements).not.toBeNull();
    expect(within(requirements!).getAllByText('In place')).toHaveLength(2);
    expect(within(requirements!).getByText('Missing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record console check' })).toBeNull();
  });

  it('shows a failed read as an alert that can be retried', async () => {
    const user = userEvent.setup();
    serve([configured()]);
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: { message: 'Not found.' } }, 404));
    render(<FreeQuotaAttestationPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That is no longer available.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/The console check is valid until/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats a body that breaks the contract as unreadable rather than as a state', async () => {
    serve([{ configured: true } as unknown as FreeQuotaAttestationStatus]);
    render(<FreeQuotaAttestationPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The free model gates could not be read.',
    );
  });
});

describe('FreeQuotaAttestationPanel, what is serving', () => {
  it('never says free models are on when nothing serves, and says what blocks them', async () => {
    serve([configured({ serving: NOTHING_SERVING })]);
    render(<FreeQuotaAttestationPanel />);

    expect(await screen.findByText(/Free models are off/)).toHaveAttribute('data-tone', 'danger');
    expect(screen.queryByText(/Free models are on/)).toBeNull();
    expect(screen.getByText('Serving now: 0 of 272 inventory models')).toBeInTheDocument();
    const reasons = screen.getByRole('list', { name: 'Why the rest are not serving' });
    expect(within(reasons).getByText('Not cleared by a current terms review')).toBeVisible();
    expect(within(reasons).getByText('91')).toBeVisible();
  });

  it('says free models are on once any model serves', async () => {
    serve([configured()]);
    render(<FreeQuotaAttestationPanel />);

    expect(await screen.findByText('Free models are on.')).toHaveAttribute('data-tone', 'ok');
    expect(screen.getByText('Serving now: 82 of 272 inventory models')).toBeInTheDocument();
  });
});

describe('FreeQuotaAttestationPanel, the terms review gate', () => {
  it('shows the terms review before the console check', async () => {
    serve([configured()]);
    render(<FreeQuotaAttestationPanel />);

    const terms = await screen.findByRole('group', { name: 'Terms review' });
    const check = screen.getByRole('group', { name: 'Console check' });
    expect(terms.compareDocumentPosition(check) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(terms).getByText(/The terms review is valid until/)).toHaveAttribute(
      'data-tone',
      'ok',
    );
    expect(within(terms).getByText('fixture-reviewer')).toBeInTheDocument();
    expect(within(terms).getByText('97')).toBeInTheDocument();
  });

  it('reports a missing review as off', async () => {
    serve([
      configured({ termsReview: { standing: 'missing', review: null }, serving: NOTHING_SERVING }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    const terms = await screen.findByRole('group', { name: 'Terms review' });
    expect(within(terms).getByText(/No terms review is recorded/)).toHaveAttribute(
      'data-tone',
      'danger',
    );
  });

  it('names the terms the review answers no to', async () => {
    serve([
      configured({
        termsReview: {
          standing: 'terms_refused',
          review: review({
            terms: { ...ALL_TERMS, proxyingAllowed: false, promptsExcludedFromTraining: false },
          }),
        },
        serving: NOTHING_SERVING,
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    const terms = await screen.findByRole('group', { name: 'Terms review' });
    expect(
      within(terms).getByText(
        /answers no to: Proxying allowed, Prompts excluded from provider training\./,
      ),
    ).toHaveAttribute('data-tone', 'danger');
    expect(within(terms).getAllByText('No')).toHaveLength(2);
    expect(within(terms).getAllByText('Yes')).toHaveLength(2);
  });

  it('reports an expired review with the date it ran out', async () => {
    serve([
      configured({
        termsReview: {
          standing: 'expired',
          review: review({ expiresAtMs: SERVER_NOW - DAY_MS }),
        },
        serving: NOTHING_SERVING,
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    const terms = await screen.findByRole('group', { name: 'Terms review' });
    expect(within(terms).getByText(/The terms review ran out on/)).toHaveAttribute(
      'data-tone',
      'danger',
    );
  });

  it('warns to renew the review inside the reminder lead', async () => {
    serve([
      configured({
        termsReview: { standing: 'expiring', review: review({ expiresAtMs: SERVER_NOW + DAY_MS }) },
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    const terms = await screen.findByRole('group', { name: 'Terms review' });
    const notice = within(terms).getByText(/Renew the terms review/);
    expect(notice).toHaveAttribute('data-tone', 'warn');
    expect(notice).toHaveTextContent('1 d from now');
  });
});

describe('FreeQuotaAttestationPanel, the console check gate', () => {
  it('reports a current check with its expiry, key binding, coverage and author', async () => {
    serve([configured()]);
    render(<FreeQuotaAttestationPanel />);

    const check = await screen.findByRole('group', { name: 'Console check' });
    expect(within(check).getByText(/The console check is valid until/)).toHaveAttribute(
      'data-tone',
      'ok',
    );
    expect(within(check).getByText(/\(25 d left\)/)).toBeInTheDocument();
    expect(within(check).getByText('The key this deployment uses')).toBeInTheDocument();
    expect(
      within(check).getByText('Every inventory model, including any added later'),
    ).toBeInTheDocument();
    expect(within(check).getByText('user_fixture_operator')).toBeInTheDocument();
    expect(within(check).getByText('None seen')).toBeInTheDocument();
  });

  it('warns to renew once the check is inside the reminder lead', async () => {
    serve([
      configured({
        attestation: {
          standing: 'expiring',
          record: record({
            checkedAtMs: SERVER_NOW - 28 * DAY_MS,
            freshUntilMs: SERVER_NOW + 2 * DAY_MS,
          }),
        },
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    const notice = await screen.findByText(/Renew the console check/);
    expect(notice).toHaveAttribute('data-tone', 'warn');
    expect(notice).toHaveTextContent('2 d from now');
  });

  it('reads the countdown against the server clock, not a fast client clock', async () => {
    serve([
      configured({
        attestation: {
          standing: 'current',
          record: record({
            checkedAtMs: SERVER_NOW - 30 * DAY_MS + 60_000,
            freshUntilMs: SERVER_NOW + 60_000,
          }),
        },
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    const notice = await screen.findByText(/Renew the console check/);
    expect(notice).toHaveTextContent('1 min from now');
  });

  it.each([
    ['stale', /ran out on/],
    ['missing', /No console check is recorded/],
    ['other_credential', /different provider key/],
    ['billing_signal', /account billing code/],
  ] as const)('marks a %s check as off', async (standing, text) => {
    serve([
      configured({
        attestation: {
          standing,
          record:
            standing === 'missing'
              ? null
              : record({
                  checkedAtMs: SERVER_NOW - 31 * DAY_MS,
                  freshUntilMs: SERVER_NOW - DAY_MS,
                  boundToCurrentKey: standing !== 'other_credential',
                }),
        },
        billingSignalAtMs: standing === 'billing_signal' ? SERVER_NOW - DAY_MS : null,
        serving: NOTHING_SERVING,
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    expect(await screen.findByText(text)).toHaveAttribute('data-tone', 'danger');
  });

  it('says a billing signal record it cannot read needs removing, not a new check', async () => {
    serve([
      configured({
        attestation: {
          standing: 'billing_signal',
          record: record({
            checkedAtMs: SERVER_NOW - 60_000,
            freshUntilMs: SERVER_NOW + 30 * DAY_MS,
          }),
        },
        billingSignalAtMs: null,
        billingSignalUnreadable: true,
        serving: NOTHING_SERVING,
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    const check = await screen.findByRole('group', { name: 'Console check' });
    const notice = within(check).getByText(/billing signal record for this key cannot be read/);
    expect(notice).toHaveAttribute('data-tone', 'danger');
    expect(notice).toHaveTextContent('a new console check cannot clear it');
    expect(notice).toHaveTextContent('remove the record');
    expect(within(check).getByText('Recorded, but its record cannot be read')).toBeInTheDocument();
    expect(within(check).queryByText(/not recorded/)).toBeNull();
  });

  it('lists withdrawn models with the reason the provider gave', async () => {
    serve([
      configured({
        withdrawn: [
          { key: 'fixture-offering-chat', displayName: 'Fixture chat model', cause: 'billing' },
        ],
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    const row = (await screen.findByText('Fixture chat model')).closest('li');
    expect(row).toHaveTextContent('the provider refused it with a billing code');
  });

  it('reads the gates again when the check runs out while the page is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    serve([
      configured({
        attestation: {
          standing: 'expiring',
          record: record({
            checkedAtMs: SERVER_NOW - 30 * DAY_MS + 10_000,
            freshUntilMs: SERVER_NOW + 10_000,
          }),
        },
      }),
      configured({
        attestation: {
          standing: 'stale',
          record: record({
            checkedAtMs: SERVER_NOW - 30 * DAY_MS + 10_000,
            freshUntilMs: SERVER_NOW + 10_000,
          }),
        },
        serving: NOTHING_SERVING,
      }),
    ]);
    const user = userEvent.setup();
    render(<FreeQuotaAttestationPanel />);
    expect(await screen.findByText('Free models are on.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Only the models I select' }));

    vi.mocked(Date.now).mockReturnValue(SERVER_NOW + CLIENT_AHEAD_MS + 60_000);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(await screen.findByText(/Free models are off/)).toBeInTheDocument();
    expect(statusReads()).toBe(2);
    expect(screen.getByRole('radio', { name: 'Only the models I select' })).toBeChecked();
  });
});

describe('FreeQuotaAttestationPanel, recording a console check', () => {
  it('names QwenCloud first and cites both consoles', async () => {
    serve([configured({ attestation: { standing: 'missing', record: null } })]);
    render(<FreeQuotaAttestationPanel />);

    expect(await screen.findByRole('link', { name: 'Free Tier page' })).toHaveAttribute(
      'href',
      'https://home.qwencloud.com/benefits',
    );
    expect(screen.getByRole('link', { name: 'QwenCloud, Free quota' })).toHaveAttribute(
      'href',
      'https://docs.qwencloud.com/resources/free-quota',
    );
    expect(
      screen.getByRole('link', { name: 'Alibaba Cloud Model Studio, Free quota for new users' }),
    ).toHaveAttribute('href', 'https://www.alibabacloud.com/help/en/model-studio/new-free-quota');
    expect(screen.getByRole('link', { name: 'Free Quota tab of Model usage' })).toHaveAttribute(
      'href',
      'https://modelstudio.console.alibabacloud.com/ap-southeast-1/costing-balance/free-quota',
    );
    expect(screen.getByText(/has no switch, so it cannot be on/)).toHaveTextContent(
      'choose Only the models I select and leave it out',
    );
  });

  it('asks for the switch in Model Studio as well, whose endpoint the requests go to', async () => {
    serve([configured({ attestation: { standing: 'missing', record: null } })]);
    render(<FreeQuotaAttestationPanel />);

    const steps = await screen.findByRole('list', { name: 'Console check steps' });
    const qwenCloud = within(steps).getByRole('link', { name: 'Free Tier page' });
    const modelStudio = within(steps).getByRole('link', { name: 'Free Quota tab of Model usage' });
    expect(
      qwenCloud.compareDocumentPosition(modelStudio) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const step = modelStudio.closest('li');
    expect(step).toHaveTextContent('turn Free Quota Only on there for the same models');
    expect(step).toHaveTextContent('Model Studio International endpoint');
    expect(step).toHaveTextContent('whenever this account can open it');
    expect(within(steps).queryByText(/If the key was issued in/)).toBeNull();
    expect(
      screen.getByRole('checkbox', {
        name: /on the QwenCloud Free Tier page and, where this account can open it, in the Model Studio Free Quota tab/,
      }),
    ).not.toBeChecked();
  });

  it('records nothing until coverage is chosen and the check is confirmed', async () => {
    const user = userEvent.setup();
    serve([configured({ attestation: { standing: 'missing', record: null } })]);
    render(<FreeQuotaAttestationPanel />);

    const button = await screen.findByRole('button', { name: 'Record console check' });
    expect(button).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I checked just now/ }));
    expect(button).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Every model/ }));
    expect(button).toBeEnabled();
  });

  it('asks first, naming the consequence, and sends nothing when cancelled', async () => {
    const user = userEvent.setup();
    serve([configured({ attestation: { standing: 'missing', record: null } })]);
    render(<FreeQuotaAttestationPanel />);

    await user.click(await screen.findByRole('radio', { name: /Every model/ }));
    await user.click(screen.getByRole('checkbox', { name: /I checked just now/ }));
    await user.click(screen.getByRole('button', { name: 'Record console check' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('bills the provider account at pay-as-you-go prices');
    expect(dialog).toHaveTextContent('stamps the record with its own clock');
    expect(dialog).toHaveTextContent('written to the audit log under your account');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(network.posts).toHaveLength(0);
  });

  it('sends no browser time even with a fast browser clock, then shows the new record', async () => {
    const user = userEvent.setup();
    serve([
      configured({ attestation: { standing: 'missing', record: null } }),
      configured({
        attestation: {
          standing: 'current',
          record: record({ checkedAtMs: SERVER_NOW, freshUntilMs: SERVER_NOW + 30 * DAY_MS }),
        },
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    await user.click(await screen.findByRole('radio', { name: /Every model/ }));
    await confirmRecording(user);

    expect(await screen.findByText(/Console check recorded at/)).toHaveAttribute('role', 'status');
    expect(network.posts).toHaveLength(1);
    expect(network.posts[0]!.body).toEqual({
      checkedAtMs: 'now',
      quotaOnlyOfferings: OFFERINGS.map((offering) => offering.key),
    });
    expect(network.posts[0]!.headers['x-csrf-token']).toBe(CSRF_TOKEN);
    expect(await screen.findByText(/The console check is valid until/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /I checked just now/ })).not.toBeChecked();
    expect(statusReads()).toBe(2);
  });

  it('starts a renewal from the models the current record covers and posts the selection', async () => {
    const user = userEvent.setup();
    serve(
      [
        configured({
          attestation: {
            standing: 'expiring',
            record: record({
              checkedAtMs: SERVER_NOW - 28 * DAY_MS,
              freshUntilMs: SERVER_NOW + 2 * DAY_MS,
              offerings: 2,
            }),
          },
        }),
      ],
      {
        status: 200,
        body: { checkedAtMs: SERVER_NOW, freshUntilMs: SERVER_NOW + 30 * DAY_MS, offerings: 1 },
      },
    );
    render(<FreeQuotaAttestationPanel />);

    const group = await screen.findByRole('group', { name: 'Models confirmed in the console' });
    expect(within(group).getByRole('checkbox', { name: /fixture-chat-model/ })).toBeChecked();
    expect(within(group).getByRole('checkbox', { name: /fixture-image-model/ })).not.toBeChecked();
    await user.click(within(group).getByRole('checkbox', { name: /fixture-video-model/ }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await confirmRecording(user);

    await waitFor(() => expect(network.posts).toHaveLength(1));
    expect(network.posts[0]!.body).toEqual({
      checkedAtMs: 'now',
      quotaOnlyOfferings: ['fixture-offering-chat'],
    });
  });

  it('records every listed model by name, so a model added to the inventory later is not covered', async () => {
    const user = userEvent.setup();
    serve([configured({ attestation: { standing: 'missing', record: null } })], {
      status: 200,
      body: { checkedAtMs: SERVER_NOW, freshUntilMs: SERVER_NOW + 30 * DAY_MS, offerings: 3 },
    });
    render(<FreeQuotaAttestationPanel />);

    await user.click(await screen.findByRole('radio', { name: /Every model listed here \(3\)/ }));
    await user.click(screen.getByRole('checkbox', { name: /I checked/ }));
    await user.click(screen.getByRole('button', { name: 'Record console check' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('every model listed here (3)');
    expect(dialog).toHaveTextContent('A model added to the inventory later is not covered');
    await user.click(within(dialog).getByRole('button', { name: 'Record check' }));

    await waitFor(() => expect(network.posts).toHaveLength(1));
    expect(network.posts[0]!.body).toEqual({
      checkedAtMs: 'now',
      quotaOnlyOfferings: [
        'fixture-offering-chat',
        'fixture-offering-image',
        'fixture-offering-video',
      ],
    });
    expect(await screen.findByText(/Console check recorded at/)).toHaveTextContent(
      'It covers 3 models',
    );
  });

  it('offers no record of every model when no model can be listed', async () => {
    const user = userEvent.setup();
    serve([configured({ attestation: { standing: 'missing', record: null }, offerings: [] })]);
    render(<FreeQuotaAttestationPanel />);

    await user.click(await screen.findByRole('radio', { name: /Every model listed here/ }));
    await user.click(screen.getByRole('checkbox', { name: /I checked/ }));

    expect(screen.getByRole('button', { name: 'Record console check' })).toBeDisabled();
  });

  it('names the listed models a renewal would leave uncovered', async () => {
    serve([
      configured({
        attestation: {
          standing: 'expiring',
          record: record({
            checkedAtMs: SERVER_NOW - 28 * DAY_MS,
            freshUntilMs: SERVER_NOW + 2 * DAY_MS,
            offerings: 2,
          }),
        },
      }),
    ]);
    render(<FreeQuotaAttestationPanel />);

    const check = await screen.findByRole('group', { name: 'Console check' });
    expect(within(check).getByText('2 models, 1 listed model not covered')).toBeInTheDocument();
  });

  it('keeps the success message when reading the gates again fails after recording', async () => {
    const user = userEvent.setup();
    serve([configured({ attestation: { standing: 'missing', record: null } }), { failWith: 503 }]);
    render(<FreeQuotaAttestationPanel />);

    await user.click(await screen.findByRole('radio', { name: /Every model listed here/ }));
    await confirmRecording(user);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Console check recorded at/)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(network.posts).toHaveLength(1);
  });

  it('shows the server refusal as an alert and keeps the form as it was', async () => {
    const user = userEvent.setup();
    serve([configured({ attestation: { standing: 'missing', record: null } })], {
      status: 503,
      body: {
        error: {
          message:
            'The free quota inventory, the shared state store and the provider key must all be configured first.',
          code: 'free_quota_not_configured',
        },
      },
    });
    render(<FreeQuotaAttestationPanel />);

    await user.click(await screen.findByRole('radio', { name: /Every model/ }));
    await confirmRecording(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The free quota inventory, the shared state store and the provider key must all be configured first.',
    );
    expect(screen.queryByText(/Console check recorded at/)).toBeNull();
    expect(screen.getByRole('checkbox', { name: /I checked just now/ })).toBeChecked();
  });
});
