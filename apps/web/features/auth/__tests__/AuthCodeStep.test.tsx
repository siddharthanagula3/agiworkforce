import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthCodeStep } from '../AuthCodeStep';
import { AUTH_RESEND_COOLDOWN_SECONDS } from '../authContract';

const EMAIL = 'person@example.com';
const CODE = '123456';
const ONE_SECOND_MS = 1000;

function renderStep(overrides: Partial<Parameters<typeof AuthCodeStep>[0]> = {}) {
  const props = {
    email: EMAIL,
    busy: false,
    error: null,
    fieldError: null,
    onSubmit: vi.fn(),
    onResend: vi.fn(),
    onEditEmail: vi.fn(),
    ...overrides,
  };
  render(<AuthCodeStep {...props} />);
  return props;
}

describe('AuthCodeStep', () => {
  it('names the inbox the code went to', () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(screen.getByText(`We sent a code to ${EMAIL}`)).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('submits on the last digit without a click', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('Code'), CODE);

    expect(props.onSubmit).toHaveBeenCalledWith(CODE);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps the field to six digits and drops anything else', async () => {
    renderStep();

    await userEvent.type(screen.getByLabelText('Code'), 'a1b2c3d4e5f6g7');

    expect(screen.getByLabelText('Code')).toHaveValue(CODE);
  });

  it('holds the resend link for the cooldown, then releases it', async () => {
    vi.useFakeTimers();
    try {
      const props = renderStep();

      expect(screen.getByRole('button', { name: /resend code in/i })).toBeDisabled();

      for (let elapsed = 0; elapsed < AUTH_RESEND_COOLDOWN_SECONDS; elapsed += 1) {
        await act(async () => {
          vi.advanceTimersByTime(ONE_SECOND_MS);
        });
      }

      expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
      expect(props.onResend).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a wrong code inline', () => {
    renderStep({ fieldError: 'That code is not correct.' });

    expect(screen.getByRole('alert')).toHaveTextContent('That code is not correct.');
  });
});
