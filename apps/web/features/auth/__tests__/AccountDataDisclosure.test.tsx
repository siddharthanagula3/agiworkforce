import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TermsGate } from '@/app/signup/TermsGate';
import { FREE_PLAN_TRAINING_DATA_DISCLOSURE } from '@/lib/compliance/free-plan-training-disclosure';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AuthLegalFooter } from '../AuthLegalFooter';

function expectPolicyDisclosure() {
  expect(screen.getByText(FREE_PLAN_TRAINING_DATA_DISCLOSURE)).toBeInTheDocument();
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

    expect(screen.queryByText(FREE_PLAN_TRAINING_DATA_DISCLOSURE)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
  });
});
