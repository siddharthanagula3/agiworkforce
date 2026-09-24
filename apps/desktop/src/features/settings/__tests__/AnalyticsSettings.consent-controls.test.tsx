import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { AnalyticsSettings } from '../AnalyticsSettings';
import { useBillingUsageStore } from '../../../stores/billingUsage';
import type { PrivacyConsent } from '../../../types/analytics';

function collectionRow(label: string): HTMLElement {
  const row = within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(`${label}:`));
  if (!row) throw new Error(`no collection row for ${label}`);
  return row;
}

describe('analytics consent controls', () => {
  beforeEach(() => {
    useBillingUsageStore.setState({
      privacyConsent: null,
      updatePrivacyConsent: (consent: PrivacyConsent) =>
        useBillingUsageStore.setState({ privacyConsent: consent }),
    });
  });

  afterEach(cleanup);

  it('names each consent switch and reports whether it is on', () => {
    render(<AnalyticsSettings />);

    for (const title of ['Enable Analytics', 'Error Reporting', 'Performance Monitoring']) {
      expect(screen.getByRole('switch', { name: title }).getAttribute('aria-checked')).toBe(
        'false',
      );
    }
  });

  it('turning one switch on changes only that consent and its disclosure row', () => {
    render(<AnalyticsSettings />);
    expect(collectionRow('Usage Events').textContent).toMatch(/^○/);

    fireEvent.click(screen.getByRole('switch', { name: 'Enable Analytics' }));

    expect(
      screen.getByRole('switch', { name: 'Enable Analytics' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('switch', { name: 'Error Reporting' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(collectionRow('Usage Events').textContent).toMatch(/^✓/);
    expect(collectionRow('Error Logs').textContent).toMatch(/^○/);
  });
});
