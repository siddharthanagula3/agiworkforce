import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  consentPurposesForWaitlistSource,
  findConsentPurpose,
  isEnterpriseWaitlistSource,
} from '@/lib/consent-purposes';
import { PublicWaitlistForm } from './PublicWaitlistForm';
import type { WaitlistModalSource } from './WaitlistModal';

const mockJoinPublicWaitlist = vi.fn();

type WaitlistServiceClientModule = typeof import('@/lib/services/waitlistServiceClient');

vi.mock('@/lib/services/waitlistServiceClient', async (importOriginal) => ({
  ...(await importOriginal<WaitlistServiceClientModule>()),
  joinPublicWaitlist: (...args: unknown[]) => mockJoinPublicWaitlist(...args),
}));

function consentBox(container: HTMLElement, purposeId: string) {
  return container.querySelector<HTMLInputElement>(`input[name="consent-${purposeId}"]`);
}

function textOutsidePlatformDisclaimer(container: HTMLElement) {
  const platformDescription = findConsentPurpose('platform_availability_waitlist')?.description;
  if (!platformDescription) throw new Error('platform_availability_waitlist is not defined');
  const text = container.textContent ?? '';
  expect(text).toContain(platformDescription);
  return text.replace(platformDescription, '');
}

async function submitWithRequiredConsent(email: string, ctaLabel: RegExp) {
  fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: /store my email address/i }));
  fireEvent.click(screen.getByRole('button', { name: ctaLabel }));
  return screen.findByRole('status');
}

describe('PublicWaitlistForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });
  });

  it('asks a mobile launch signup for the platform consent and never the Enterprise one', () => {
    const { container } = render(<PublicWaitlistForm source="mobile" ctaLabel="Notify Me" />);

    const platformBox = consentBox(container, 'platform_availability_waitlist');
    expect(platformBox).toBeInTheDocument();
    expect(platformBox).toHaveAccessibleName(/tell you when this platform ships/i);
    expect(platformBox).toHaveAccessibleName(/required for this request/i);
    expect(consentBox(container, 'product_updates')).toBeInTheDocument();
    expect(consentBox(container, 'enterprise_waitlist')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);

    expect(textOutsidePlatformDisclaimer(container)).not.toMatch(/enterprise/i);
  });

  it('submits a mobile launch signup with its source and the platform decisions', async () => {
    render(<PublicWaitlistForm source="mobile" ctaLabel="Notify Me" />);

    const status = await submitWithRequiredConsent('  Visitor@Example.COM ', /^notify me$/i);

    expect(mockJoinPublicWaitlist).toHaveBeenCalledTimes(1);
    expect(mockJoinPublicWaitlist).toHaveBeenCalledWith({
      email: 'visitor@example.com',
      referralSource: 'mobile',
      consentSurface: 'web-waitlist-inline',
      consent: [
        { purpose: 'platform_availability_waitlist', granted: true },
        { purpose: 'product_updates', granted: false },
      ],
    });
    expect(status).not.toHaveTextContent(/enterprise/i);
  });

  it('blocks a mobile launch signup until the platform consent is ticked', async () => {
    render(<PublicWaitlistForm source="mobile" ctaLabel="Notify Me" />);

    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: 'visitor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^notify me$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/tick the box/i);
    expect(mockJoinPublicWaitlist).not.toHaveBeenCalled();
  });

  it('confirms a platform signup without Enterprise wording by default', async () => {
    render(<PublicWaitlistForm source="other" ctaLabel="Get notified" />);

    const status = await submitWithRequiredConsent('visitor@example.com', /^get notified$/i);

    expect(status).toHaveTextContent(/verified installer to download/i);
    expect(status).not.toHaveTextContent(/enterprise/i);
    await waitFor(() => {
      expect(mockJoinPublicWaitlist).toHaveBeenCalledWith(
        expect.objectContaining({
          referralSource: 'other',
          consent: [
            { purpose: 'platform_availability_waitlist', granted: true },
            { purpose: 'product_updates', granted: false },
          ],
        }),
      );
    });
  });

  it('keeps the Enterprise consent and confirmation for the website source', async () => {
    const { container } = render(<PublicWaitlistForm source="website" />);

    const enterpriseBox = consentBox(container, 'enterprise_waitlist');
    expect(enterpriseBox).toBeInTheDocument();
    expect(enterpriseBox).toHaveAccessibleName(/contract-scoped Enterprise access/i);
    expect(consentBox(container, 'platform_availability_waitlist')).not.toBeInTheDocument();

    const status = await submitWithRequiredConsent('visitor@example.com', /^join waitlist$/i);

    expect(status).toHaveTextContent(/contract-scoped Enterprise access/i);
    expect(mockJoinPublicWaitlist).toHaveBeenCalledWith({
      email: 'visitor@example.com',
      referralSource: 'website',
      consentSurface: 'web-waitlist-inline',
      consent: [
        { purpose: 'enterprise_waitlist', granted: true },
        { purpose: 'product_updates', granted: false },
      ],
    });
  });

  it('keeps platform sources out of the Enterprise dialog', () => {
    // @ts-expect-error the Enterprise dialog shows only the Enterprise consent set
    const mobile: WaitlistModalSource = 'mobile';
    // @ts-expect-error the Enterprise dialog shows only the Enterprise consent set
    const other: WaitlistModalSource = 'other';

    for (const source of [mobile, other]) {
      const purposeIds = consentPurposesForWaitlistSource(source).map((purpose) => purpose.id);

      expect(isEnterpriseWaitlistSource(source)).toBe(false);
      expect(purposeIds).not.toContain('enterprise_waitlist');
    }
  });
});
