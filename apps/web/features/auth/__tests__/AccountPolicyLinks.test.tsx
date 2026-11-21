import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TermsGate } from '@/app/signup/TermsGate';
import {
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_SIGNUP_STATEMENT,
} from '@/lib/compliance/free-plan-training-disclosure';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AccountPolicyLinks } from '../AccountPolicyLinks';
import { AuthEmailStep } from '../AuthEmailStep';
import { AuthLegalFooter } from '../AuthLegalFooter';

const TRAINING_COPY = /train/i;

function renderSignupScreen() {
  render(
    <AuthEmailStep
      mode="signup"
      providers={[{ id: 'google', label: 'Google' }]}
      switchUrl="/login"
      ready
      phase="idle"
      error={null}
      fieldError={null}
      switchOffered={false}
      providerPending={null}
      onSubmit={() => undefined}
      onStartProvider={() => undefined}
    />,
  );
}

describe('account policy disclosure', () => {
  it('keeps the sign-up screen to its agreement line, with no training notice or expander', () => {
    renderSignupScreen();

    expect(screen.getByTestId('auth-signup-agreement')).toBeInTheDocument();
    expect(screen.queryByText(TRAINING_COPY)).toBeNull();
    expect(document.querySelector('details')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Data Use Guidelines' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Acceptable Use Policy' })).toBeNull();
  });

  it('keeps the terms review to the agreement itself, without a training card, and still gated', () => {
    render(
      <TermsGate confirmationLabel="Agree and continue">
        <div>Record agreement</div>
      </TermsGate>,
    );

    expect(screen.queryByText(TRAINING_COPY)).toBeNull();
    expect(document.querySelector('details')).toBeNull();
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Agree and continue' })).toBeInTheDocument();
    expect(screen.queryByText('Record agreement')).not.toBeInTheDocument();
  });

  it('links both policies under the terms review', () => {
    render(<AccountPolicyLinks />);

    expect(screen.getByRole('link', { name: 'Data Use Guidelines' })).toHaveAttribute(
      'href',
      CANONICAL_POLICY_ROUTES.dataUse,
    );
    expect(screen.getByRole('link', { name: 'Acceptable Use Policy' })).toHaveAttribute(
      'href',
      CANONICAL_POLICY_ROUTES.acceptableUse,
    );
  });

  it('keeps routine sign-in limited to policy links without any disclosure', () => {
    render(<AuthLegalFooter />);

    expect(screen.queryByText(TRAINING_COPY)).toBeNull();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      CANONICAL_POLICY_ROUTES.privacy,
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      CANONICAL_POLICY_ROUTES.terms,
    );
  });

  it('keeps the full statement about training, the providers and the opt-out', () => {
    expect(FREE_PLAN_TRAINING_SIGNUP_STATEMENT).not.toBe(FREE_PLAN_TRAINING_DATA_DISCLOSURE);
    expect(FREE_PLAN_TRAINING_SIGNUP_STATEMENT).toContain('train');
    expect(FREE_PLAN_TRAINING_SIGNUP_STATEMENT).toContain('AGI-owned');
    expect(FREE_PLAN_TRAINING_SIGNUP_STATEMENT).toContain('Settings > Privacy');
  });

  it('names the privacy toggle by the label the settings section renders', () => {
    const source = readFileSync(
      join(process.cwd(), 'features/settings/sections/PrivacySection.tsx'),
      'utf8',
    );
    const label = /label: '([^']*do not train[^']*)'/.exec(source)?.[1];

    expect(label).toBeTruthy();
    expect(FREE_PLAN_TRAINING_SIGNUP_STATEMENT).toContain(`turn on ${label} in`);
  });
});
