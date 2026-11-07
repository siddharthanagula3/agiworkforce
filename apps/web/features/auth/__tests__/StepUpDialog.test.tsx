import { createRequestAuthority } from '@/lib/identity/request-authority';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.hoisted(() => vi.fn());

const reverification = vi.hoisted(() => ({
  start: vi.fn(),
  sendEmailCode: vi.fn(),
  verifyPassword: vi.fn(),
  verifyEmailCode: vi.fn(),
  verifyPasskey: vi.fn(),
  verifySecondFactor: vi.fn(),
  freshToken: vi.fn(),
}));

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'session-token') }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));
vi.mock('@/lib/identity/client', () => ({
  useSessionReverification: () => reverification,
  useSignOut: () => signOut,
}));

import { StepUpDialog } from '../StepUpDialog';

const CONSEQUENCE = 'Ownership of this workspace moves to another member.';
const AUTHENTICATOR_ONLY = { kind: 'second_factor', methods: ['authenticator'] } as const;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  signOut.mockReset();
  for (const fn of Object.values(reverification)) fn.mockReset();
  reverification.freshToken.mockResolvedValue('fresh-session-token');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StepUpDialog', () => {
  it('names the consequence and hands the minted proof to the caller', async () => {
    const user = userEvent.setup();
    const onSatisfied = vi.fn();
    reverification.start.mockResolvedValue(AUTHENTICATOR_ONLY);
    reverification.verifySecondFactor.mockResolvedValue({ kind: 'complete' });
    fetchMock.mockResolvedValue(jsonResponse(200, { token: 'grant.signature' }));

    render(
      <StepUpDialog
        open
        action="organization.transfer_ownership"
        consequence={CONSEQUENCE}
        resourceId="org-1"
        level="second_factor"
        onCancel={vi.fn()}
        onSatisfied={onSatisfied}
      />,
    );

    expect(await screen.findByText(CONSEQUENCE)).toBeInTheDocument();
    await user.type(await screen.findByLabelText('Code from your authenticator app'), '123456');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(onSatisfied).toHaveBeenCalledWith('grant.signature'));
    expect(reverification.start).toHaveBeenCalledWith('second_factor');
    expect(reverification.verifySecondFactor).toHaveBeenCalledWith('authenticator', '123456');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/step-up');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer fresh-session-token',
    });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      action: 'organization.transfer_ownership',
      resourceId: 'org-1',
    });
  });

  it('shows why the code was refused and mints nothing', async () => {
    const user = userEvent.setup();
    const onSatisfied = vi.fn();
    reverification.start.mockResolvedValue(AUTHENTICATOR_ONLY);
    reverification.verifySecondFactor.mockRejectedValue({
      errors: [{ code: 'form_code_incorrect', message: 'Incorrect code' }],
    });

    render(
      <StepUpDialog
        open
        action="organization.transfer_ownership"
        consequence={CONSEQUENCE}
        level="second_factor"
        onCancel={vi.fn()}
        onSatisfied={onSatisfied}
      />,
    );

    await user.type(await screen.findByLabelText('Code from your authenticator app'), '000000');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That code was not accepted.');
    expect(onSatisfied).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks an account with no second factor for its password instead', async () => {
    const user = userEvent.setup();
    const onSatisfied = vi.fn();
    reverification.start.mockResolvedValue({
      kind: 'first_factor',
      password: true,
      passkey: false,
      emailCode: { emailAddressId: 'email-1', destination: 'a***@example.com' },
    });
    reverification.verifyPassword.mockResolvedValue({ kind: 'complete' });
    fetchMock.mockResolvedValue(jsonResponse(200, { token: 'grant.signature' }));

    render(
      <StepUpDialog
        open
        action="account.delete"
        consequence="Your account is scheduled for deletion."
        level="first_factor"
        onCancel={vi.fn()}
        onSatisfied={onSatisfied}
      />,
    );

    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Email me a code instead' })).toBeInTheDocument();
    await user.type(password, 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(onSatisfied).toHaveBeenCalledWith('grant.signature'));
    expect(reverification.start).toHaveBeenCalledWith('first_factor');
    expect(reverification.verifyPassword).toHaveBeenCalledWith('correct horse battery');
  });

  it('mints one grant per confirmation, so a code is never spent twice', async () => {
    const user = userEvent.setup();
    const onSatisfied = vi.fn();
    reverification.start.mockResolvedValue(AUTHENTICATOR_ONLY);
    reverification.verifySecondFactor.mockResolvedValue({ kind: 'complete' });
    fetchMock.mockResolvedValue(jsonResponse(200, { token: 'grant.signature' }));

    render(
      <StepUpDialog
        open
        action="two_factor.disable"
        consequence="Two-factor authentication is switched off."
        level="second_factor"
        onCancel={vi.fn()}
        onSatisfied={onSatisfied}
      />,
    );

    await user.type(await screen.findByLabelText('Code from your authenticator app'), '654321');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(onSatisfied).toHaveBeenCalledWith('grant.signature'));
    expect(reverification.verifySecondFactor).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('owned dialog actions', () => {
  function authority() {
    return createRequestAuthority({
      userId: 'a',
      sessionId: 'session-a',
      isCurrent: () => true,
      getToken: async () => 'fake-token',
    });
  }

  it('does not acquire a token or grant after late verification on a retired intent', async () => {
    const user = userEvent.setup();
    const owner = authority();
    let finish!: (value: { kind: 'complete' }) => void;
    reverification.start.mockResolvedValue(AUTHENTICATOR_ONLY);
    reverification.verifySecondFactor.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onSatisfied = vi.fn();
    render(
      <StepUpDialog
        open
        authority={owner}
        action="organization.transfer_ownership"
        consequence={CONSEQUENCE}
        level="second_factor"
        onCancel={vi.fn()}
        onSatisfied={onSatisfied}
      />,
    );
    await user.type(await screen.findByLabelText('Code from your authenticator app'), '123456');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));
    owner.retire();
    await act(async () => {
      finish({ kind: 'complete' });
    });
    expect(reverification.verifySecondFactor).toHaveBeenCalledOnce();
    expect(reverification.freshToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSatisfied).not.toHaveBeenCalled();
  });

  it('does not sign out from a retired intent', async () => {
    const user = userEvent.setup();
    const owner = authority();
    reverification.start.mockResolvedValue({ kind: 'unavailable' });
    render(
      <StepUpDialog
        open
        authority={owner}
        action="organization.transfer_ownership"
        consequence={CONSEQUENCE}
        level="first_factor"
        onCancel={vi.fn()}
        onSatisfied={vi.fn()}
      />,
    );
    const button = await screen.findByRole('button', { name: 'Sign in again' });
    owner.retire();
    await user.click(button);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('pins sign-in-again to the original session', async () => {
    const user = userEvent.setup();
    const owner = authority();
    reverification.start.mockResolvedValue({ kind: 'unavailable' });
    render(
      <StepUpDialog
        open
        authority={owner}
        action="organization.transfer_ownership"
        consequence={CONSEQUENCE}
        level="first_factor"
        onCancel={vi.fn()}
        onSatisfied={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-a' }));
  });
});
