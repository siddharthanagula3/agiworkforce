import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'session-token') }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));

import { StepUpDialog } from '../StepUpDialog';

const CONSEQUENCE = 'Ownership of this workspace moves to another member.';

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
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StepUpDialog', () => {
  it('names the consequence and hands the minted proof to the caller', async () => {
    const user = userEvent.setup();
    const onSatisfied = vi.fn();
    fetchMock.mockResolvedValue(jsonResponse(200, { token: 'grant.signature' }));

    render(
      <StepUpDialog
        open
        action="organization.transfer_ownership"
        consequence={CONSEQUENCE}
        resourceId="org-1"
        onCancel={vi.fn()}
        onSatisfied={onSatisfied}
      />,
    );

    expect(await screen.findByText(CONSEQUENCE)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Authenticator or backup code/i), '123456');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(onSatisfied).toHaveBeenCalledWith('grant.signature'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/step-up');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      action: 'organization.transfer_ownership',
      code: '123456',
      resourceId: 'org-1',
    });
  });

  it('shows the server message and mints nothing when the code is rejected', async () => {
    const user = userEvent.setup();
    const onSatisfied = vi.fn();
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { message: 'That code was not accepted.' } }),
    );

    render(
      <StepUpDialog
        open
        action="organization.transfer_ownership"
        consequence={CONSEQUENCE}
        onCancel={vi.fn()}
        onSatisfied={onSatisfied}
      />,
    );

    await user.type(await screen.findByLabelText(/Authenticator or backup code/i), '000000');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That code was not accepted.');
    expect(onSatisfied).not.toHaveBeenCalled();
  });

  it('points an unenrolled account at two-factor setup instead of retrying the code', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: { message: 'Turn on two-factor authentication before performing this action.' },
      }),
    );

    render(
      <StepUpDialog
        open
        action="account.delete"
        consequence="Your account is scheduled for deletion."
        onCancel={vi.fn()}
        onSatisfied={vi.fn()}
      />,
    );

    await user.type(await screen.findByLabelText(/Authenticator or backup code/i), '123456');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(
      await screen.findByRole('link', { name: /set up two-factor authentication/i }),
    ).toHaveAttribute('href', '/settings/security');
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeDisabled();
  });

  it('mints one grant per confirmation, so a code is never spent twice', async () => {
    const user = userEvent.setup();
    const onSatisfied = vi.fn();
    fetchMock.mockResolvedValue(jsonResponse(200, { token: 'grant.signature' }));

    render(
      <StepUpDialog
        open
        action="two_factor.disable"
        consequence="Two-factor authentication is switched off."
        onCancel={vi.fn()}
        onSatisfied={onSatisfied}
      />,
    );

    await user.type(await screen.findByLabelText(/Authenticator or backup code/i), '654321');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(onSatisfied).toHaveBeenCalledWith('grant.signature'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
