import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectorDetailView } from '../ConnectorDetailView';
import type { DirectoryConnectorDetail } from '../types';

afterEach(cleanup);

function detail(patch: Partial<DirectoryConnectorDetail> = {}): DirectoryConnectorDetail {
  return {
    kind: 'connector',
    id: 'customerscore',
    name: 'Customerscore',
    summary: 'Customer health insights',
    badge: 'community',
    publisher: 'Customerscore Inc',
    tools: ['list_customers'],
    documentationUrl: 'https://docs.invalid',
    websiteUrl: 'https://site.invalid',
    repositoryUrl: 'https://github.invalid/customerscore',
    privacyPolicyUrl: 'https://privacy.invalid',
    connected: false,
    connectable: true,
    connectableMode: 'connect',
    ...patch,
  };
}

function renderDetail(
  patch: Partial<DirectoryConnectorDetail> = {},
  props: Partial<Parameters<typeof ConnectorDetailView>[0]> = {},
) {
  const onConnect = vi.fn();
  const onOpenHref = vi.fn();
  render(
    <ConnectorDetailView
      detail={detail(patch)}
      onBack={vi.fn()}
      onConnect={onConnect}
      onOpenHref={onOpenHref}
      {...props}
    />,
  );
  return { onConnect, onOpenHref };
}

describe('ConnectorDetailView primary action', () => {
  it('offers Connect for an OAuth connector', () => {
    const { onConnect } = renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalled();
  });

  it('offers Add API key for a credential form connector', () => {
    const { onConnect } = renderDetail({ connectableMode: 'api-key-form' });
    fireEvent.click(screen.getByRole('button', { name: 'Add API key' }));
    expect(onConnect).toHaveBeenCalled();
  });

  it('opens the credential form for an api key connector instead of posting', () => {
    const onRequestCredentials = vi.fn();
    const { onConnect } = renderDetail(
      { connectableMode: 'api-key-form' },
      { onRequestCredentials },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add API key' }));
    expect(onRequestCredentials).toHaveBeenCalledTimes(1);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('renders the credential form in place of the primary action once requested', () => {
    renderDetail(
      { connectableMode: 'api-key-form' },
      { credentialForm: <form aria-label="API key form" /> },
    );
    expect(screen.getByRole('form', { name: 'API key form' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add API key' })).toBeNull();
  });

  it('explains desktop availability and links the download page', () => {
    renderDetail({
      connectableMode: 'desktop-and-cli',
      connectable: false,
      desktopHref: '/download',
    });
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(screen.getAllByText('Available on desktop and CLI').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Get the desktop app' }).getAttribute('href')).toBe(
      '/download',
    );
  });

  it('says what is missing for a connector that needs setup', () => {
    renderDetail({
      connectableMode: 'needs-setup',
      connectable: false,
      setupNotice: 'This connector does not say how it authenticates.',
    });
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(screen.getByText('Needs setup')).toBeTruthy();
    expect(screen.getByText('This connector does not say how it authenticates.')).toBeTruthy();
  });

  it('shows Connected once the account has connected it', () => {
    renderDetail({ connected: true });
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  });
});

describe('ConnectorDetailView anatomy', () => {
  it('lists documentation, website, repository and privacy links', () => {
    const { onOpenHref } = renderDetail();
    for (const label of ['Documentation', 'Website', 'Repository', 'Privacy Policy']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Repository' }));
    expect(onOpenHref).toHaveBeenCalledWith('https://github.invalid/customerscore');
  });

  it('renders the publisher, the badge and the tool names', () => {
    renderDetail();
    expect(screen.getByText('Made by')).toBeTruthy();
    expect(screen.getByText('Customerscore Inc')).toBeTruthy();
    expect(screen.getByText('Community')).toBeTruthy();
    expect(screen.getByText('list_customers')).toBeTruthy();
  });

  it('prefers the long description and falls back to the summary', () => {
    renderDetail({ description: 'Scores every customer on health and churn risk.' });
    expect(screen.getByText('Scores every customer on health and churn risk.')).toBeTruthy();
    cleanup();
    renderDetail();
    expect(screen.getAllByText('Customer health insights').length).toBe(2);
  });

  it('says whether sign-in is required and omits the row when unknown', () => {
    renderDetail({ signInRequired: true });
    expect(screen.getByText('Sign-in')).toBeTruthy();
    expect(screen.getByText('Required')).toBeTruthy();
    cleanup();
    renderDetail({ signInRequired: false });
    expect(screen.getByText('None')).toBeTruthy();
    cleanup();
    renderDetail();
    expect(screen.queryByText('Sign-in')).toBeNull();
  });

  it('renders the added date only when the record carries one', () => {
    renderDetail({ addedAt: '2026-08-14T00:00:00Z' });
    expect(screen.getByText('Added')).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
    cleanup();
    renderDetail({ addedAt: 'not a date' });
    expect(screen.queryByText('Added')).toBeNull();
  });

  it('shows the vendor listing sentence in place of the connect control', () => {
    renderDetail({
      connectableMode: 'needs-setup',
      connectable: false,
      listingNote: 'Acme lists this connector without a public endpoint.',
      setupNotice: 'This connector does not say how it authenticates.',
    });
    expect(screen.getByText('Acme lists this connector without a public endpoint.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(screen.queryByText('Needs setup')).toBeNull();
    expect(screen.queryByText('This connector does not say how it authenticates.')).toBeNull();
  });

  it('lists related connectors and opens one from its card', () => {
    const onOpenRelated = vi.fn();
    const onInstallRelated = vi.fn();
    renderDetail(
      {
        related: [
          {
            id: 'segment',
            name: 'Segment',
            description: 'Customer data',
            connectableMode: 'connect',
          },
        ],
      },
      { onOpenRelated, onInstallRelated },
    );
    expect(screen.getByText('Related connectors')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Segment' }));
    expect(onOpenRelated).toHaveBeenCalledWith('segment');
    fireEvent.click(screen.getByRole('button', { name: 'Connect Segment' }));
    expect(onInstallRelated).toHaveBeenCalledWith('segment');
  });

  it('links the terms page when the surface names one', () => {
    renderDetail({ termsHref: '/terms' });
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe(
      '/terms',
    );
  });

  it('renders the footer the surface supplies', () => {
    renderDetail({}, { footer: <button type="button">Tool permissions</button> });
    expect(screen.getByRole('button', { name: 'Tool permissions' })).toBeTruthy();
  });
});
