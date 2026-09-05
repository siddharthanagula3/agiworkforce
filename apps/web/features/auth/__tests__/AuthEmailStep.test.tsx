import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthEmailStep } from '../AuthEmailStep';
import type { AuthProvider } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
];

function renderStep(overrides: Partial<Parameters<typeof AuthEmailStep>[0]> = {}) {
  const props = {
    mode: 'login' as const,
    providers: PROVIDERS,
    switchUrl: '/signup',
    ready: true,
    busy: false,
    error: null,
    fieldError: null,
    switchOffered: false,
    termsAccepted: false,
    providerPending: null,
    onTermsChange: vi.fn(),
    onSubmit: vi.fn(),
    onStartProvider: vi.fn(),
    ...overrides,
  };
  render(<AuthEmailStep {...props} />);
  return props;
}

describe('AuthEmailStep', () => {
  it('asks for an email and one provider button per configured provider', () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-legal-footer')).toBeInTheDocument();
  });

  it('submits the trimmed email', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('Email address'), '  person@example.com  ');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSubmit).toHaveBeenCalledWith('person@example.com');
  });

  it('carries the terms checkbox above the primary button on sign up', async () => {
    const props = renderStep({ mode: 'signup' });

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox'));

    expect(props.onTermsChange).toHaveBeenCalledWith(true);
  });

  it('shows the terms refusal inline rather than as a banner', () => {
    renderStep({ mode: 'signup', error: 'Accept the terms to create an account.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Accept the terms to create an account.');
  });

  it('drops the footer policy line on sign up, where the checkbox carries it', () => {
    renderStep({ mode: 'signup' });

    expect(screen.queryByTestId('auth-legal-footer')).toBeNull();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('shows an unknown email inline against the field, with the way out', () => {
    renderStep({ fieldError: 'No account uses this email.', switchOffered: true });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No account uses this email. Sign up instead.');
    expect(screen.getByRole('link', { name: 'Sign up instead.' })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('waits for the identity client before letting the form submit', () => {
    renderStep({ ready: false });

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
