import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WaitlistModalProvider, WaitlistTrigger } from './WaitlistModal';

const mockJoinPublicWaitlist = vi.fn();

vi.mock('@/lib/services/waitlistServiceClient', () => ({
  joinPublicWaitlist: (...args: unknown[]) => mockJoinPublicWaitlist(...args),
}));

function grantRequiredConsent() {
  fireEvent.click(screen.getByRole('checkbox', { name: /store my email address/i }));
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

async function openDialog(triggerLabel: string) {
  render(
    <WaitlistModalProvider>
      <WaitlistTrigger label={triggerLabel} />
    </WaitlistModalProvider>,
  );
  const trigger = screen.getByRole('button', { name: triggerLabel });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', undefined, { timeout: 5_000 });
  return { trigger, dialog };
}

describe('WaitlistModal', () => {
  beforeAll(async () => {
    await import('./WaitlistDialog');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('never interrupts a visitor with an automatic modal', () => {
    vi.useFakeTimers();
    try {
      render(
        <WaitlistModalProvider>
          <span>app</span>
        </WaitlistModalProvider>,
      );
      act(() => {
        vi.advanceTimersByTime(120_000);
      });
      expect(screen.queryByText(/discuss enterprise access/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders a /waitlist link fallback when no provider is mounted', () => {
    render(<WaitlistTrigger label="Join Cloud waitlist" />);

    const link = screen.getByRole('link', { name: /join cloud waitlist/i });
    expect(link).toHaveAttribute('href', '/waitlist');
  });

  it('opens the modal from a trigger and submits an anonymous signup', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" source="website" />
      </WaitlistModalProvider>,
    );

    expect(screen.queryByText(/discuss enterprise access/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));
    expect(
      await screen.findByText(/discuss enterprise access/i, undefined, { timeout: 5_000 }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: '  Visitor@Example.COM ' },
    });
    grantRequiredConsent();
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    await waitFor(() => {
      expect(mockJoinPublicWaitlist).toHaveBeenCalledWith({
        email: 'visitor@example.com',
        referralSource: 'website',
        consentSurface: 'web-waitlist-modal',
        consent: [
          { purpose: 'enterprise_waitlist', granted: true },
          { purpose: 'product_updates', granted: false },
        ],
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/you.re on the list/i)).toBeInTheDocument();
    });
  });

  it('closes from its visible close control', async () => {
    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Team access" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /team access/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close waitlist dialog/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('validates the email locally before calling the service', async () => {
    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: /email address/i }), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(mockJoinPublicWaitlist).not.toHaveBeenCalled();
  });

  it('surfaces a service error without closing the modal', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({
      success: false,
      error: 'Failed to join waitlist. Please try again.',
    });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: /email address/i }), {
      target: { value: 'visitor@example.com' },
    });
    grantRequiredConsent();
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to join/i);
    expect(screen.getByText(/discuss enterprise access/i)).toBeInTheDocument();
  });

  it('refuses to submit until the required consent is ticked', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: /email address/i }), {
      target: { value: 'visitor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/tick the box/i);
    expect(mockJoinPublicWaitlist).not.toHaveBeenCalled();
  });

  it('renders both consent purposes unticked, and requires only the necessary one', async () => {
    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));

    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).not.toBeChecked();
  });

  it('passes a non-default source through to the service', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Request cloud" source="byok" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /request cloud/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: /email address/i }), {
      target: { value: 'visitor@example.com' },
    });
    grantRequiredConsent();
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    await waitFor(() => {
      expect(mockJoinPublicWaitlist).toHaveBeenCalledWith({
        email: 'visitor@example.com',
        referralSource: 'byok',
        consentSurface: 'web-waitlist-modal',
        consent: [
          { purpose: 'enterprise_waitlist', granted: true },
          { purpose: 'product_updates', granted: false },
        ],
      });
    });
  });

  it('shows the email label instead of hiding it from sighted visitors', async () => {
    const { dialog } = await openDialog('Team access');

    const label = within(dialog).getByText('Email address', { exact: true });
    expect(label.tagName).toBe('LABEL');
    expect(label).not.toHaveClass('sr-only');
    expect(label).toHaveClass('agi-ds-field-label');
    expect(label.closest('.agi-ds-field')).toContainElement(
      within(dialog).getByRole('textbox', { name: 'Email address' }),
    );
    expect(dialog.querySelector('form')).toHaveClass('agi-ds-form');
    expect(dialog.querySelector('.agi-ds-form-row')).toBeNull();
  });

  it('keeps the title in a head that sits outside the scrolling body', async () => {
    const { dialog } = await openDialog('Team access');

    const head = dialog.querySelector('.agi-ds-waitlist-head');
    const body = dialog.querySelector('.agi-ds-waitlist-body');
    expect(head?.parentElement).toBe(dialog);
    expect(body?.parentElement).toBe(dialog);

    const title = within(dialog).getByRole('heading', { name: 'Discuss Enterprise access' });
    expect(head).toContainElement(title);
    expect(body).not.toContainElement(title);
    expect(body).toContainElement(dialog.querySelector('form'));
    expect(body).toContainElement(dialog.querySelector('.agi-ds-hint'));
    expect(body).not.toContainElement(
      within(dialog).getByRole('button', { name: 'Close waitlist dialog' }),
    );
  });

  it('keeps the success title in the head and its message in the body', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });
    const { dialog } = await openDialog('Team access');

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Email address' }), {
      target: { value: 'visitor@example.com' },
    });
    grantRequiredConsent();
    fireEvent.click(within(dialog).getByRole('button', { name: /^join waitlist$/i }));

    const title = await within(dialog).findByRole('heading', { name: /you.re on the list/i });
    expect(title.closest('.agi-ds-waitlist-head')).not.toBeNull();
    expect(title.closest('.agi-ds-waitlist-body')).toBeNull();
    expect(
      within(dialog)
        .getByRole('link', { name: '/privacy/requests' })
        .closest('.agi-ds-waitlist-body'),
    ).not.toBeNull();
  });

  it('orders focus from the email field to the close control', async () => {
    const { dialog } = await openDialog('Team access');

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    expect(focusable[0]).toBe(within(dialog).getByRole('textbox', { name: 'Email address' }));
    expect(focusable.at(-1)).toBe(
      within(dialog).getByRole('button', { name: 'Close waitlist dialog' }),
    );
  });

  it('starts focus on the email field and returns it to the trigger on Escape', async () => {
    const { trigger, dialog } = await openDialog('Team access');

    const email = within(dialog).getByRole('textbox', { name: 'Email address' });
    await waitFor(() => expect(email).toHaveFocus());

    fireEvent.keyDown(email, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
