import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { TERMS_GATE_STORAGE_KEY, TermsGate } from './TermsGate';

describe('terms confirmation', () => {
  beforeEach(() => window.localStorage.clear());

  it('requires an explicit Continue after checking, and allows reconsidering before submission', async () => {
    const user = userEvent.setup();
    render(
      <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue">
        <p role="status">Recording agreement</p>
      </TermsGate>,
    );

    const checkbox = screen.getByRole('checkbox');
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();
    await user.click(checkbox);
    expect(button).toBeEnabled();
    expect(screen.queryByText('Recording agreement')).not.toBeInTheDocument();
    await user.click(checkbox);
    expect(button).toBeDisabled();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
    await user.click(checkbox);
    await user.click(button);
    expect(screen.getByText('Recording agreement')).toBeInTheDocument();
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('does not accept a saved browser marker as consent on the login surface', () => {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    render(
      <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue">
        <p>Recording agreement</p>
      </TermsGate>,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.queryByText('Recording agreement')).not.toBeInTheDocument();
  });

  it('preserves the default pre-auth gate behavior', () => {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    render(
      <TermsGate>
        <p>Existing sign-up content</p>
      </TermsGate>,
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByText('Existing sign-up content')).toBeInTheDocument();
  });
});
