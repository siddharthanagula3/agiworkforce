import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ServiceNotices } from '../ServiceNotices';

const PRODUCT_INCIDENT =
  'AGI is having a problem right now, and some requests may fail. We are working on it.';
const BILLING_INCIDENT =
  'Billing is having a problem right now, so upgrades and billing changes may not go through. We are working on it.';

function serveNotices(notices: readonly Record<string, unknown>[]) {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ notices }),
  } as Response);
}

const MAINTENANCE =
  'Planned maintenance from Oct 2, 2026, 8:00 AM UTC to Oct 2, 2026, 9:00 AM UTC. Some features may not respond while it runs.';

function renderNotices(
  scope: 'product' | 'billing',
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={client}>
      <ServiceNotices scope={scope} />
    </QueryClientProvider>,
  );
}

let feed: readonly Record<string, unknown>[] = [];

function serveFeed() {
  vi.spyOn(global, 'fetch').mockImplementation(
    async () => ({ ok: true, json: async () => ({ notices: feed }) }) as Response,
  );
}

async function refetchFeed(client: QueryClient) {
  await act(async () => {
    await client.refetchQueries({ queryKey: ['service-notices'] });
  });
}

async function dismiss(message: string) {
  const card = (await screen.findByText(message)).parentElement!;
  fireEvent.click(within(card).getByRole('button', { name: 'Dismiss this notice' }));
  await waitFor(() => expect(screen.queryByText(message)).toBeNull());
}

const incident = (scope: string, message: string) => ({
  id: `incident:${scope}`,
  kind: 'incident',
  tone: scope === 'billing' ? 'warning' : 'danger',
  scope,
  message,
  href: '/status',
  linkLabel: 'Status',
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('ServiceNotices', () => {
  it('keeps a billing incident out of the product-wide stack', async () => {
    serveNotices([incident('product', PRODUCT_INCIDENT), incident('billing', BILLING_INCIDENT)]);

    renderNotices('product');

    expect(await screen.findByText(PRODUCT_INCIDENT)).toBeVisible();
    expect(screen.queryByText(BILLING_INCIDENT)).toBeNull();
  });

  it('shows the billing incident where billing happens, and only there', async () => {
    serveNotices([incident('product', PRODUCT_INCIDENT), incident('billing', BILLING_INCIDENT)]);

    renderNotices('billing');

    expect(await screen.findByText(BILLING_INCIDENT)).toBeVisible();
    expect(screen.queryByText(PRODUCT_INCIDENT)).toBeNull();
    expect(screen.getByRole('link', { name: 'Status' })).toHaveAttribute('href', '/status');
  });

  it('keeps every dismissal when two surfaces each dismiss their own notice', async () => {
    serveNotices([
      incident('product', PRODUCT_INCIDENT),
      incident('billing', BILLING_INCIDENT),
      {
        id: 'maintenance:2026-10-02T08:00:00.000Z',
        kind: 'maintenance',
        tone: 'info',
        scope: 'product',
        message: MAINTENANCE,
        href: '/maintenance',
        linkLabel: 'Details',
      },
    ]);
    const billingSurface = renderNotices('billing');
    const productSurface = renderNotices('product');

    const productIncident = (await within(productSurface.container).findByText(PRODUCT_INCIDENT))
      .parentElement!;
    fireEvent.click(within(productIncident).getByRole('button', { name: 'Dismiss this notice' }));
    const billingIncident = (await within(billingSurface.container).findByText(BILLING_INCIDENT))
      .parentElement!;
    fireEvent.click(within(billingIncident).getByRole('button', { name: 'Dismiss this notice' }));
    cleanup();

    renderNotices('product');

    expect(await screen.findByText(MAINTENANCE)).toBeVisible();
    expect(screen.queryByText(PRODUCT_INCIDENT)).toBeNull();
  });

  it('reads a notice that names no scope as a product notice', async () => {
    serveNotices([
      {
        id: 'incident:2026-10-02T06:00:00.000Z',
        kind: 'incident',
        tone: 'danger',
        message: PRODUCT_INCIDENT,
        href: '/status',
        linkLabel: 'Status',
      },
    ]);

    renderNotices('product');

    expect(await screen.findByText(PRODUCT_INCIDENT)).toBeVisible();
  });

  it('holds a dismissal for as long as its incident stays in the feed', async () => {
    feed = [incident('product', PRODUCT_INCIDENT)];
    serveFeed();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderNotices('product', client);

    await dismiss(PRODUCT_INCIDENT);
    await refetchFeed(client);

    expect(screen.queryByText(PRODUCT_INCIDENT)).toBeNull();
  });

  it('shows an incident that recurs in the same tab after the dismissed one resolved', async () => {
    feed = [incident('product', PRODUCT_INCIDENT)];
    serveFeed();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderNotices('product', client);
    await dismiss(PRODUCT_INCIDENT);

    feed = [];
    await refetchFeed(client);
    feed = [incident('product', PRODUCT_INCIDENT)];
    await refetchFeed(client);

    expect(await screen.findByText(PRODUCT_INCIDENT)).toBeVisible();
  });

  it('shows an incident that recurs after a reload once the dismissed one resolved', async () => {
    feed = [incident('product', PRODUCT_INCIDENT)];
    serveFeed();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderNotices('product', client);
    await dismiss(PRODUCT_INCIDENT);
    feed = [];
    await refetchFeed(client);
    cleanup();

    feed = [incident('product', PRODUCT_INCIDENT)];
    renderNotices('product');

    expect(await screen.findByText(PRODUCT_INCIDENT)).toBeVisible();
  });

  it('keeps a billing dismissal while a product surface reads a feed that still carries it', async () => {
    feed = [incident('product', PRODUCT_INCIDENT), incident('billing', BILLING_INCIDENT)];
    serveFeed();
    renderNotices('billing');
    await dismiss(BILLING_INCIDENT);
    cleanup();

    renderNotices('product');
    expect(await screen.findByText(PRODUCT_INCIDENT)).toBeVisible();
    cleanup();

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderNotices('billing', client);
    await waitFor(() => expect(client.getQueryData(['service-notices'])).toHaveLength(2));

    expect(screen.queryByText(BILLING_INCIDENT)).toBeNull();
  });
});
