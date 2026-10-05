import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthCodeStep } from '../AuthCodeStep';
import { AUTH_RESEND_COOLDOWN_SECONDS } from '../authContract';

const EMAIL = 'person@example.com';
const CODE = '123456';
const WRONG_CODE = '111111';
const REFUSAL = 'That code is not correct.';
const ONE_SECOND_MS = 1000;

function renderStep(overrides: Partial<Parameters<typeof AuthCodeStep>[0]> = {}) {
  const props = {
    email: EMAIL,
    phase: 'idle' as const,
    error: null,
    fieldError: null,
    onSubmit: vi.fn(),
    onResend: vi.fn(),
    onEditEmail: vi.fn(),
    ...overrides,
  };
  const view = render(<AuthCodeStep {...props} />);
  return {
    ...props,
    rerender: (next: Partial<Parameters<typeof AuthCodeStep>[0]>) =>
      view.rerender(<AuthCodeStep {...props} {...next} />),
  };
}

async function waitOutResendCooldown() {
  for (let elapsed = 0; elapsed < AUTH_RESEND_COOLDOWN_SECONDS; elapsed += 1) {
    await act(async () => {
      vi.advanceTimersByTime(ONE_SECOND_MS);
    });
  }
}

async function resendAfterRefusedCode() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const props = renderStep();
  await user.type(screen.getByLabelText('Code'), WRONG_CODE);
  props.rerender({ fieldError: REFUSAL });
  await waitOutResendCooldown();
  await user.click(screen.getByRole('button', { name: 'Resend code' }));
  props.rerender({ fieldError: null });
  return { user, props };
}

describe('AuthCodeStep', () => {
  it('names the inbox the code went to', () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(screen.getByText(`We sent a code to ${EMAIL}`)).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('says a new device is being verified when the code confirms the device', () => {
    renderStep({ purpose: 'device' });

    expect(screen.getByRole('heading', { name: 'Verify this device' })).toBeInTheDocument();
    expect(
      screen.getByText(`You are signing in on a new device. We emailed a code to ${EMAIL}`),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('says why a code is asked for when the account has no password to check', () => {
    renderStep({ purpose: 'passwordless' });

    expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(
      screen.getByText(`This account does not use a password, so we emailed a code to ${EMAIL}`),
    ).toBeInTheDocument();
    expect(screen.queryByText(`We sent a code to ${EMAIL}`)).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.getByLabelText('Code')).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('submits on the last digit without a click', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('Code'), CODE);

    expect(props.onSubmit).toHaveBeenCalledWith(CODE);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sends a typed code once when Continue lands before the screen turns busy', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('Code'), CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sends the same code again when the person retries after a refusal', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('Code'), CODE);
    props.rerender({ fieldError: REFUSAL });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSubmit).toHaveBeenCalledTimes(2);
    expect(props.onSubmit).toHaveBeenLastCalledWith(CODE);
  });

  describe('after a refused code is resent', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('empties the field, so Continue asks for the new code instead of doing nothing', async () => {
      const { user, props } = await resendAfterRefusedCode();
      const field = screen.getByLabelText('Code');
      const askedForCode = vi.fn();
      field.addEventListener('invalid', askedForCode);

      expect(props.onResend).toHaveBeenCalledTimes(1);
      expect(field).toHaveValue('');

      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(askedForCode).toHaveBeenCalledTimes(1);
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it('sends the new code once it is typed', async () => {
      const { user, props } = await resendAfterRefusedCode();

      await user.type(screen.getByLabelText('Code'), CODE);

      expect(props.onSubmit).toHaveBeenCalledTimes(2);
      expect(props.onSubmit).toHaveBeenLastCalledWith(CODE);
    });
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

      await waitOutResendCooldown();

      expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
      expect(props.onResend).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds the resend control for the window the server asked for', async () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderStep();

      await waitOutResendCooldown();
      expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();

      rerender({ resendBlockedSeconds: 90 });

      expect(screen.getByRole('button', { name: 'Resend code in 90s' })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the code field to digits the platform can autofill', () => {
    renderStep();

    const field = screen.getByLabelText('Code');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAttribute('pattern', '[0-9]*');
    expect(field).toHaveAttribute('autocapitalize', 'off');
  });

  it('reports a wrong code inline', () => {
    renderStep({ fieldError: REFUSAL });

    expect(screen.getByRole('alert')).toHaveTextContent(REFUSAL);
  });

  it('holds the address where it is while the code is being checked', async () => {
    const props = renderStep({ phase: 'verifying' });

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    await userEvent.click(edit);
    expect(props.onEditEmail).not.toHaveBeenCalled();
  });
});
