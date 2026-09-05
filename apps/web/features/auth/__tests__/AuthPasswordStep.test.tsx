import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthPasswordStep } from '../AuthPasswordStep';

const EMAIL = 'person@example.com';

function renderStep(overrides: Partial<Parameters<typeof AuthPasswordStep>[0]> = {}) {
  const props = {
    email: EMAIL,
    busy: false,
    error: null,
    fieldError: null,
    onSubmit: vi.fn(),
    onEditEmail: vi.fn(),
    onForgotPassword: vi.fn(),
    onUseCode: vi.fn(),
    ...overrides,
  };
  render(<AuthPasswordStep {...props} />);
  return props;
}

describe('AuthPasswordStep', () => {
  it('shows the email it is asking about with a way back to change it', async () => {
    const props = renderStep();

    expect(screen.getByRole('heading', { name: 'Enter your password' })).toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(props.onEditEmail).toHaveBeenCalled();
  });

  it('submits the password', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSubmit).toHaveBeenCalledWith('correct horse');
  });

  it('reveals the password on request', async () => {
    renderStep();

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('offers a reset and a code as the two ways past a password', async () => {
    const props = renderStep();

    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code instead' }));

    expect(props.onForgotPassword).toHaveBeenCalled();
    expect(props.onUseCode).toHaveBeenCalled();
  });

  it('reports a wrong password inline and marks the field invalid', () => {
    renderStep({ fieldError: 'That password is not correct.' });

    expect(screen.getByRole('alert')).toHaveTextContent('That password is not correct.');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables the button while a submission is in flight', () => {
    renderStep({ busy: true });

    const button = screen.getByRole('button', { name: /working/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
