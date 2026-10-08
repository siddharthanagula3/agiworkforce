import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TermsGate } from '@/app/signup/TermsGate';
import {
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_SIGNUP_NOTICE,
  FREE_PLAN_TRAINING_SIGNUP_STATEMENT,
  FREE_PLAN_TRAINING_TERMS_CARD_BODY,
  FREE_PLAN_TRAINING_TERMS_CARD_LINK_LABEL,
  FREE_PLAN_TRAINING_TERMS_CARD_TITLE,
} from '@/lib/compliance/free-plan-training-disclosure';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AccountPolicyLinks } from '../AccountDataDisclosure';
import { AuthEmailStep } from '../AuthEmailStep';
import { AuthLegalFooter } from '../AuthLegalFooter';

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
  it('keeps the primary notice short and reveals the full provider-training explanation nearby', async () => {
    renderSignupScreen();

    const notice = screen.getByTestId('auth-data-use-notice');
    expect(notice).toHaveTextContent(FREE_PLAN_TRAINING_SIGNUP_NOTICE);
    const details = notice.querySelector('details');
    const summary = screen.getByText('Data use details');
    expect(summary.tagName).toBe('SUMMARY');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).not.toBeVisible();

    await userEvent.click(summary);

    expect(details).toHaveAttribute('open');
    expect(screen.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Data Use Guidelines' })).toHaveAttribute(
      'href',
      CANONICAL_POLICY_ROUTES.dataUse,
    );
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
    expect(screen.queryByRole('link', { name: 'Acceptable Use Policy' })).toBeNull();

    await userEvent.click(summary);

    expect(screen.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).not.toBeVisible();
  });

  it('places the notice with the agreement, before the account-switch link', () => {
    renderSignupScreen();

    const agreement = screen.getByTestId('auth-signup-agreement');
    const notice = screen.getByTestId('auth-data-use-notice');
    const switchLink = screen.getByRole('link', { name: 'Log in' });
    expect(
      agreement.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      notice.compareDocumentPosition(switchLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the terms review notice short and reveals the full explanation before agreement, without bypassing the gate', async () => {
    render(
      <TermsGate confirmationLabel="Agree and continue">
        <div>Record agreement</div>
      </TermsGate>,
    );

    const card = screen.getByTestId('account-data-disclosure');
    expect(card).toHaveTextContent(FREE_PLAN_TRAINING_TERMS_CARD_TITLE);
    expect(card).toHaveTextContent(FREE_PLAN_TRAINING_TERMS_CARD_BODY);
    const summary = screen.getByText(FREE_PLAN_TRAINING_TERMS_CARD_LINK_LABEL);
    expect(summary.tagName).toBe('SUMMARY');
    expect(screen.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).not.toBeVisible();

    await userEvent.click(summary);

    expect(screen.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).toBeVisible();
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

  it('says in the short card that free-plan providers may train on chats and where the choice is', () => {
    expect(FREE_PLAN_TRAINING_TERMS_CARD_BODY).toContain('train');
    expect(FREE_PLAN_TRAINING_TERMS_CARD_BODY).toContain('Settings > Privacy');
  });

  it('keeps routine sign-in limited to policy links without repeating any disclosure', () => {
    render(<AuthLegalFooter />);

    expect(screen.queryByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).not.toBeInTheDocument();
    expect(screen.queryByText(FREE_PLAN_TRAINING_SIGNUP_NOTICE)).not.toBeInTheDocument();
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

  for (const file of ['AccountDataDisclosure.tsx', 'AuthDataUseNotice.tsx']) {
    it(`${file} imports its sentence from the barrel and restates no training copy`, () => {
      const source = readFileSync(join(process.cwd(), 'features/auth', file), 'utf8');

      expect(source).toContain("from '@/lib/compliance/free-plan-training-disclosure'");
      const withoutImports = source.replace(/^import[\s\S]*?;$/gm, '');
      expect(withoutImports.match(/'[^']*train[^']*'|"[^"]*train[^"]*"/g)).toBeNull();
    });
  }
});
