import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthSecondFactorStep } from '../AuthSecondFactorStep';
import type { AuthSecondFactor } from '../authContract';

const AUTHENTICATOR: AuthSecondFactor = {
  kind: 'authenticator',
  label: 'Authenticator code',
  hint: null,
};

function renderStep(overrides: Partial<Parameters<typeof AuthSecondFactorStep>[0]> = {}) {
  const props = {
    factor: AUTHENTICATOR,
    busy: false,
    error: null,
    fieldError: null,
    onSubmit: vi.fn(),
    onEditEmail: vi.fn(),
    ...overrides,
  };
  render(<AuthSecondFactorStep {...props} />);
  return props;
}

describe('AuthSecondFactorStep', () => {
  it('labels the field with the factor the account uses', () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'Confirm it is you' })).toBeInTheDocument();
    expect(screen.getByLabelText('Authenticator code')).toBeInTheDocument();
    expect(screen.getByText('Enter the code from your authenticator app')).toBeInTheDocument();
  });

  it('names the destination when the factor has one', () => {
    renderStep({
      factor: { kind: 'text_message', label: 'Text message code', hint: '+1 555' },
    });

    expect(
      screen.getByText('Enter the code we sent by text message to +1 555'),
    ).toBeInTheDocument();
  });

  it('takes letters for a backup code', () => {
    renderStep({ factor: { kind: 'backup_code', label: 'Backup code', hint: null } });

    expect(screen.getByLabelText('Backup code')).toHaveAttribute('inputmode', 'text');
  });

  it('submits the trimmed code', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('Authenticator code'), ' 123456 ');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSubmit).toHaveBeenCalledWith('123456');
  });

  it('lets the user start again with a different email', async () => {
    const props = renderStep();

    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }));

    expect(props.onEditEmail).toHaveBeenCalled();
  });

  it('reports a rejected code inline', () => {
    renderStep({ fieldError: 'That code is not correct.' });

    expect(screen.getByRole('alert')).toHaveTextContent('That code is not correct.');
  });
});
