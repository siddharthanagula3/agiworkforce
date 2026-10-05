import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  confirmation: {
    isLoaded: true,
    email: 'person@example.com' as string | null,
    sendCode: vi.fn(),
    confirm: vi.fn(),
    endOtherSessions: vi.fn(),
  },
  refresh: vi.fn(),
  order: [] as string[],
}));

vi.mock('@/lib/identity/client', async (importOriginal) => ({
  ...(await importOriginal()),
  usePrimaryEmailConfirmation: () => mocks.confirmation,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { ConfirmEmailStep } from '../ConfirmEmailStep';

function renderStep() {
  render(<ConfirmEmailStep footer={<button type="button">Sign out</button>} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  mocks.confirmation.isLoaded = true;
  mocks.confirmation.email = 'person@example.com';
  mocks.confirmation.sendCode.mockResolvedValue(undefined);
  mocks.confirmation.confirm.mockImplementation(async () => {
    mocks.order.push('confirm');
  });
  mocks.confirmation.endOtherSessions.mockImplementation(async () => {
    mocks.order.push('end-other-sessions');
  });
  mocks.refresh.mockImplementation(() => {
    mocks.order.push('refresh');
  });
});

describe('confirming an address the account was opened without', () => {
  it('emails one code on arrival and names where it went, with a way to sign out', async () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'Confirm your email address' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.confirmation.sendCode).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/We emailed a code to person@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/signs this account out everywhere else/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('confirms the code, ends every other session, then reloads the page to continue', async () => {
    renderStep();
    await waitFor(() => expect(mocks.confirmation.sendCode).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText('Code'), '424242');

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.confirmation.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.confirmation.confirm).toHaveBeenCalledWith('424242');
    expect(mocks.order).toEqual(['confirm', 'end-other-sessions', 'refresh']);
    expect(screen.getByRole('heading', { name: 'Email address confirmed' })).toBeInTheDocument();
  });

  it('keeps a refused code on the step with its reason and ends nothing', async () => {
    mocks.confirmation.confirm.mockRejectedValue({
      errors: [{ code: 'form_code_incorrect', meta: { paramName: 'code' } }],
    });
    renderStep();
    await waitFor(() => expect(mocks.confirmation.sendCode).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText('Code'), '000000');

    await waitFor(() =>
      expect(screen.getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(mocks.confirmation.endOtherSessions).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Confirm your email address' })).toBeInTheDocument();
  });

  it('says when other sessions could not be ended and retries only that', async () => {
    mocks.confirmation.endOtherSessions
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(undefined);
    renderStep();
    await waitFor(() => expect(mocks.confirmation.sendCode).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText('Code'), '424242');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your address is confirmed, but this account could not be signed out everywhere else yet.',
    );
    expect(mocks.refresh).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.confirmation.endOtherSessions).toHaveBeenCalledTimes(2);
    expect(mocks.confirmation.confirm).toHaveBeenCalledTimes(1);
  });

  it('explains an account with no address instead of sending a code', () => {
    mocks.confirmation.email = null;

    renderStep();

    expect(screen.getByRole('status')).toHaveTextContent(
      'This account has no email address to confirm',
    );
    expect(mocks.confirmation.sendCode).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Code')).toBeNull();
  });
});
