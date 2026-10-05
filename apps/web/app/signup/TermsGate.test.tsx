import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ACCOUNT_AGE_CONFIRMATION_LABEL } from '@agiworkforce/types';

import { useProductUpdatesGrant } from '@/features/auth/productUpdatesChoice';
import { FREE_PLAN_TRAINING_SIGNUP_STATEMENT } from '@/lib/compliance/free-plan-training-disclosure';
import { PRODUCT_UPDATES_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE } from '@/lib/consent-signals';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { PRODUCT_UPDATES_CHOICE_STORAGE_KEY } from './signupAttemptMarkers';
import { TERMS_GATE_STORAGE_KEY, TermsGate } from './TermsGate';

function GrantProbe() {
  const grant = useProductUpdatesGrant();
  return <p data-testid="grant-probe">{grant ?? 'no grant'}</p>;
}

function termsBox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /I agree to the Terms of Service/ });
}

function productUpdatesBox(): HTMLElement {
  return screen.getByRole('checkbox', { name: PRODUCT_UPDATES_CONSENT_PURPOSE.label });
}

function renderReview(props: { offerProductUpdates?: boolean; optedOutBySignal?: boolean } = {}) {
  return render(
    <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue" confirmAge {...props}>
      <GrantProbe />
    </TermsGate>,
  );
}

describe('terms confirmation', () => {
  beforeEach(() => window.localStorage.clear());

  it('asks for the terms and the age on the first screen and holds Continue until both are ticked', async () => {
    const user = userEvent.setup();
    render(
      <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue" confirmAge>
        <p role="status">Recording agreement</p>
      </TermsGate>,
    );

    const terms = screen.getByRole('checkbox', { name: /I agree to the Terms of Service/ });
    const age = screen.getByRole('checkbox', { name: ACCOUNT_AGE_CONFIRMATION_LABEL });
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(screen.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).toBeInTheDocument();
    expect(button).toBeDisabled();

    await user.click(terms);
    expect(button).toBeDisabled();
    await user.click(age);
    expect(button).toBeEnabled();
    await user.click(terms);
    expect(button).toBeDisabled();
    await user.click(terms);
    await user.click(button);

    expect(screen.getByText('Recording agreement')).toBeInTheDocument();
    expect(terms).toBeDisabled();
    expect(age).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('asks only for the terms when the account already confirmed its age', () => {
    render(
      <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue">
        <p>Recording agreement</p>
      </TermsGate>,
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(
      screen.queryByRole('checkbox', { name: ACCOUNT_AGE_CONFIRMATION_LABEL }),
    ).not.toBeInTheDocument();
  });

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

describe('product updates on the terms review screen', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'globalPrivacyControl');
  });

  it('is not asked unless the page offers it', () => {
    renderReview();

    expect(
      screen.queryByRole('checkbox', { name: PRODUCT_UPDATES_CONSENT_PURPOSE.label }),
    ).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('offers one optional unticked box under the terms, which Continue never waits for', async () => {
    const user = userEvent.setup();
    renderReview({ offerProductUpdates: true });
    const optional = productUpdatesBox();
    const age = screen.getByRole('checkbox', { name: ACCOUNT_AGE_CONFIRMATION_LABEL });

    expect(optional).not.toBeChecked();
    expect(optional).not.toBeRequired();
    expect(screen.getAllByRole('checkbox')).toEqual([age, termsBox(), optional]);

    await user.click(optional);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.click(optional);
    await user.click(termsBox());
    await user.click(age);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('grant-probe')).toHaveTextContent('no grant');
  });

  it('hands a ticked choice to the recorder with the notice version on screen, and then holds it', async () => {
    const user = userEvent.setup();
    renderReview({ offerProductUpdates: true });

    await user.click(termsBox());
    await user.click(screen.getByRole('checkbox', { name: ACCOUNT_AGE_CONFIRMATION_LABEL }));
    await user.click(productUpdatesBox());
    expect(screen.queryByTestId('grant-probe')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('grant-probe')).toHaveTextContent(POLICY_LAST_UPDATED.privacy);
    expect(productUpdatesBox()).toBeChecked();
    expect(productUpdatesBox()).toBeDisabled();
    expect(window.localStorage.getItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY)).toBeNull();
  });

  it('never hands over a grant the page did not ask for', async () => {
    const user = userEvent.setup();
    render(
      <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue">
        <GrantProbe />
      </TermsGate>,
    );

    await user.click(termsBox());
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('grant-probe')).toHaveTextContent('no grant');
  });

  it('drops a choice an abandoned sign-up left in the browser when the terms box is ticked', async () => {
    window.localStorage.setItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);
    renderReview({ offerProductUpdates: true });

    await userEvent.click(termsBox());

    expect(window.localStorage.getItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY)).toBeNull();
    expect(productUpdatesBox()).not.toBeChecked();
  });

  it.each([
    ['the request header', { optedOutBySignal: true }, false],
    ['the browser property', {}, true],
  ])(
    'cannot be ticked under Global Privacy Control read from %s, and hands over no grant',
    async (_source, props, property) => {
      if (property) {
        Object.defineProperty(navigator, 'globalPrivacyControl', {
          configurable: true,
          value: true,
        });
      }
      const user = userEvent.setup();
      renderReview({ offerProductUpdates: true, ...props });
      const optional = productUpdatesBox();

      expect(optional).toHaveAttribute('aria-disabled', 'true');
      expect(optional).toHaveAccessibleDescription(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE);
      optional.focus();
      expect(optional).toHaveFocus();

      await user.keyboard(' ');
      await user.click(optional);
      await user.click(termsBox());
      await user.click(screen.getByRole('checkbox', { name: ACCOUNT_AGE_CONFIRMATION_LABEL }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(optional).not.toBeChecked();
      expect(screen.getByTestId('grant-probe')).toHaveTextContent('no grant');
    },
  );
});
