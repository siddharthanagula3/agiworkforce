import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthNewPasswordStep } from '../AuthNewPasswordStep';
import { AUTH_PASSWORD_MIN_LENGTH } from '../authContract';

const EMAIL = 'person@example.com';

function renderStep(overrides: Partial<Parameters<typeof AuthNewPasswordStep>[0]> = {}) {
  const props = {
    email: EMAIL,
    phase: 'idle' as const,
    error: null,
    fieldError: null,
    onSubmit: vi.fn(),
    ...overrides,
  };
  render(<AuthNewPasswordStep {...props} />);
  return props;
}

describe('AuthNewPasswordStep', () => {
  it('says which account needs the new password', () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    expect(screen.getByText(`This account needs a new password for ${EMAIL}`)).toBeInTheDocument();
  });

  it('asks the browser to save it as a new password', () => {
    renderStep();

    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('submits the new password', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('New password'), 'a longer passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSubmit).toHaveBeenCalledWith('a longer passphrase');
  });

  it('asks a new account to create its password and lets it change the address', async () => {
    const onEditEmail = vi.fn();
    const props = renderStep({ purpose: 'sign_up', onEditEmail });

    expect(screen.getByRole('heading', { name: 'Create a password' })).toBeInTheDocument();
    expect(screen.getByText(`You will use it with ${EMAIL} to log in`)).toBeInTheDocument();
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('autocomplete', 'new-password');

    await userEvent.type(field, 'a longer passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(props.onSubmit).toHaveBeenCalledWith('a longer passphrase');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEditEmail).toHaveBeenCalled();
  });

  it('holds the address where it is while the new account is being created', async () => {
    const onEditEmail = vi.fn();
    renderStep({ purpose: 'sign_up', phase: 'verifying', onEditEmail });

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    await userEvent.click(edit);
    expect(onEditEmail).not.toHaveBeenCalled();
  });

  it('states the password rule before the first attempt and ties it to the field', () => {
    renderStep({ purpose: 'sign_up' });

    const rule = screen.getByText(
      `Use at least ${AUTH_PASSWORD_MIN_LENGTH} characters. Passwords that are easy to guess or found in a data breach are not accepted.`,
    );
    const describedBy = screen.getByLabelText('Password').getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toContain(rule.id);
  });

  it('keeps the rule beside the field when a new password is set after a reset', () => {
    renderStep();

    expect(
      screen.getByText(
        `Use at least ${AUTH_PASSWORD_MIN_LENGTH} characters. Passwords that are easy to guess or found in a data breach are not accepted.`,
      ),
    ).toBeInTheDocument();
  });

  it('says what it is doing while the password is being set, in a region mounted beforehand', () => {
    const { rerender } = render(
      <AuthNewPasswordStep
        email={EMAIL}
        purpose="sign_up"
        phase="idle"
        error={null}
        fieldError={null}
        onSubmit={vi.fn()}
      />,
    );
    const status = screen.getByTestId('auth-phase');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();

    rerender(
      <AuthNewPasswordStep
        email={EMAIL}
        purpose="sign_up"
        phase="verifying"
        error={null}
        fieldError={null}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('auth-phase')).toBe(status);
    expect(status).toHaveTextContent('Checking what you entered');
    expect(screen.getByLabelText('Password')).toBeDisabled();
  });

  it('names the account the new password belongs to, for a password manager, in either purpose', () => {
    for (const [purpose, label] of [
      ['reset', 'New password'],
      ['sign_up', 'Password'],
    ] as const) {
      const { unmount } = render(
        <AuthNewPasswordStep
          email={EMAIL}
          purpose={purpose}
          phase="idle"
          error={null}
          fieldError={null}
          onSubmit={vi.fn()}
        />,
      );
      const password = screen.getByLabelText(label);
      const username = password
        .closest('form')
        ?.querySelector<HTMLInputElement>('input[autocomplete="username"]');

      expect(username, purpose).toHaveValue(EMAIL);
      expect(username).toHaveAttribute('readonly');
      expect(username).not.toBeVisible();
      expect(username!.compareDocumentPosition(password)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      unmount();
    }
  });

  it('reports a rejected password inline', () => {
    renderStep({ fieldError: 'That password is too common.' });

    expect(screen.getByRole('alert')).toHaveTextContent('That password is too common.');
  });
});
