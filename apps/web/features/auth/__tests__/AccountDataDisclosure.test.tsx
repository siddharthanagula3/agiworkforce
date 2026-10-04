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
import { AuthLegalFooter } from '../AuthLegalFooter';

function expectPolicyDisclosure() {
  expect(screen.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Data Use Guidelines' })).toHaveAttribute(
    'href',
    CANONICAL_POLICY_ROUTES.dataUse,
  );
  expect(screen.getByRole('link', { name: 'Acceptable Use Policy' })).toHaveAttribute(
    'href',
    CANONICAL_POLICY_ROUTES.acceptableUse,
  );
}

describe('account policy disclosure', () => {
  it('shows provider data handling alongside the signup agreement before signup begins', () => {
    render(<AuthLegalFooter variant="signup" />);

    expect(screen.getByTestId('auth-legal-footer')).toHaveTextContent('By signing up, you agree');
    expectPolicyDisclosure();
  });

  it('shows the same disclosure before accepting current terms without bypassing the gate', () => {
    render(
      <TermsGate confirmationLabel="Agree and continue">
        <div>Record agreement</div>
      </TermsGate>,
    );

    expectPolicyDisclosure();
    expect(screen.getByRole('button', { name: 'Agree and continue' })).toBeInTheDocument();
    expect(screen.queryByText('Record agreement')).not.toBeInTheDocument();
  });

  it('keeps routine sign-in limited to policy links without repeating the signup disclosure', () => {
    render(<AuthLegalFooter />);

    expect(screen.queryByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
  });

  it('states training, the providers and the opt-out without needing the pricing table', () => {
    render(<AuthLegalFooter variant="signup" />);

    const paragraph = screen.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT);
    expect(paragraph.textContent).not.toBe(FREE_PLAN_TRAINING_DATA_DISCLOSURE);
    expect(paragraph).toHaveTextContent('train');
    expect(paragraph).toHaveTextContent('AGI-owned');
    expect(paragraph).toHaveTextContent('Settings > Privacy');
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

  it('imports the statement from the barrel and restates no training copy', () => {
    const source = readFileSync(
      join(process.cwd(), 'features/auth/AccountDataDisclosure.tsx'),
      'utf8',
    );

    expect(source).toContain("from '@/lib/compliance/free-plan-training-disclosure'");
    const withoutImports = source.replace(/^import[\s\S]*?;$/gm, '');
    expect(withoutImports.match(/'[^']*train[^']*'|"[^"]*train[^"]*"/g)).toBeNull();
  });
});
