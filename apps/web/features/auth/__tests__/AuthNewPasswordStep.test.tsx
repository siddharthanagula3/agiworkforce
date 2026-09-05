import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthNewPasswordStep } from '../AuthNewPasswordStep';

const EMAIL = 'person@example.com';

function renderStep(overrides: Partial<Parameters<typeof AuthNewPasswordStep>[0]> = {}) {
  const props = {
    email: EMAIL,
    busy: false,
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

  it('reports a rejected password inline', () => {
    renderStep({ fieldError: 'That password is too common.' });

    expect(screen.getByRole('alert')).toHaveTextContent('That password is too common.');
  });
});
