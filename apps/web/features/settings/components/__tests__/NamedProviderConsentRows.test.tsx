import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { composeFreeModelProviderNotice } from '@agiworkforce/compliance';
import { NAMED_PROVIDER_CONSENT_NAMESPACE } from '@/lib/named-provider-consent';
import { announceNamedProviderConsentRequired } from '@/features/models/lib/named-provider-consent-client';
import { NamedProviderConsentRows } from '../NamedProviderConsentRows';

const preferences = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => preferences);

const notice = composeFreeModelProviderNotice('qwen');
const ACCEPTED = {
  qwen: {
    providerId: 'qwen',
    accepted: true,
    acceptedAt: '2026-10-05T09:00:00.000Z',
    disclosureVersion: notice.version,
    surface: 'web',
  },
};

const WITHDRAWN = { qwen: { ...ACCEPTED.qwen, accepted: false } };

function providerSwitch() {
  return screen.getByRole('switch', { name: notice.settingLabel });
}

async function settled() {
  await waitFor(() => expect(preferences.fetchPreferenceNamespace).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
}

describe('the named provider switch in Settings, Privacy', () => {
  beforeEach(() => {
    preferences.fetchPreferenceNamespace.mockReset().mockResolvedValue({});
    preferences.savePreferenceNamespace.mockReset().mockResolvedValue({ version: null });
  });

  it('shows nothing to an account that holds no answer for the provider', async () => {
    const { container } = render(<NamedProviderConsentRows />);
    await settled();

    expect(container).toBeEmptyDOMElement();
    expect(preferences.fetchPreferenceNamespace).toHaveBeenCalledWith(
      NAMED_PROVIDER_CONSENT_NAMESPACE,
      {},
    );
  });

  it('shows the switch, off, to an account that withdrew its agreement', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue(WITHDRAWN);
    render(<NamedProviderConsentRows />);

    await waitFor(() => expect(providerSwitch()).not.toBeChecked());
    expect(screen.getByText(notice.settingDescription)).toBeInTheDocument();
  });

  it('shows the whole notice before turning on, and records the agreement only on Agree', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue(WITHDRAWN);
    render(<NamedProviderConsentRows />);
    await waitFor(() => expect(providerSwitch()).toBeEnabled());

    await userEvent.click(providerSwitch());

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(notice.title)).toBeInTheDocument();
    for (const statement of notice.statements) {
      expect(within(dialog).getByText(statement)).toBeInTheDocument();
    }
    expect(within(dialog).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(within(dialog).getByRole('link', { name: 'Provider list' })).toHaveAttribute(
      'href',
      '/subprocessors',
    );
    expect(preferences.savePreferenceNamespace).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: notice.acceptLabel }));

    await waitFor(() => expect(providerSwitch()).toBeChecked());
    expect(preferences.savePreferenceNamespace).toHaveBeenCalledTimes(1);
    const [namespace, value, options] = preferences.savePreferenceNamespace.mock.calls[0]!;
    expect(namespace).toBe(NAMED_PROVIDER_CONSENT_NAMESPACE);
    expect(options).toEqual({ merge: true });
    expect(value).toEqual({
      qwen: {
        providerId: 'qwen',
        accepted: true,
        acceptedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        disclosureVersion: notice.version,
        surface: 'web',
      },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leaves it off when the notice is closed without agreeing', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue(WITHDRAWN);
    render(<NamedProviderConsentRows />);
    await waitFor(() => expect(providerSwitch()).toBeEnabled());
    await userEvent.click(providerSwitch());

    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Not now' }),
    );

    expect(providerSwitch()).not.toBeChecked();
    expect(preferences.savePreferenceNamespace).not.toHaveBeenCalled();
  });

  it('withdraws the agreement when switched off', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue(ACCEPTED);
    render(<NamedProviderConsentRows />);
    await waitFor(() => expect(providerSwitch()).toBeChecked());

    await userEvent.click(providerSwitch());

    await waitFor(() => expect(providerSwitch()).not.toBeChecked());
    expect(preferences.savePreferenceNamespace.mock.calls[0]![1]).toMatchObject({
      qwen: { providerId: 'qwen', accepted: false, disclosureVersion: notice.version },
    });
  });

  it('reads an agreement to wording that has since changed as off', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue({
      qwen: { ...ACCEPTED.qwen, disclosureVersion: 'fnv-0000000000000000' },
    });
    render(<NamedProviderConsentRows />);

    await waitFor(() => expect(providerSwitch()).toBeEnabled());
    expect(providerSwitch()).not.toBeChecked();
  });

  it('keeps the switch as it was and says so when the change cannot be saved', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue(ACCEPTED);
    preferences.savePreferenceNamespace.mockRejectedValue(new Error('Unavailable'));
    render(<NamedProviderConsentRows />);
    await waitFor(() => expect(providerSwitch()).toBeChecked());

    await userEvent.click(providerSwitch());

    expect(await screen.findByRole('alert')).toHaveTextContent('That change was not saved.');
    expect(providerSwitch()).toBeChecked();
  });

  it('says the setting could not be loaded when the answer cannot be read, with no switch claiming a state it does not know', async () => {
    preferences.fetchPreferenceNamespace.mockRejectedValue(new Error('Unavailable'));
    render(<NamedProviderConsentRows />);

    const row = await screen.findByRole('status');
    expect(row).toHaveTextContent(notice.settingLabel);
    expect(row).toHaveTextContent(
      'This setting could not be loaded, so it is not shown as on or off. Reload the page to see or change it.',
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('turns off when the server refuses a turn for want of the agreement', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue(ACCEPTED);
    render(<NamedProviderConsentRows />);
    await waitFor(() => expect(providerSwitch()).toBeChecked());

    announceNamedProviderConsentRequired('qwen', 'any-model');

    await waitFor(() => expect(providerSwitch()).not.toBeChecked());
  });
});
