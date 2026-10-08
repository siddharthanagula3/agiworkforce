import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  ACCOUNT_AGE_FIELD_LABEL,
  ACCOUNT_AGE_INELIGIBLE_MESSAGE,
  ACCOUNT_AGE_REQUIRED_MESSAGE,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_MINIMUM_AGE,
  PARENTAL_PERMISSION_BELOW_AGE,
} from '@agiworkforce/types';
import { AuthSceneBridgeProvider, createSceneStore } from '@agiworkforce/ui/auth-scene';

import { useMarketingEmailGrant } from '@/features/auth/marketingEmailChoice';
import { FREE_PLAN_TRAINING_SIGNUP_STATEMENT } from '@/lib/compliance/free-plan-training-disclosure';
import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE } from '@/lib/consent-signals';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { MARKETING_EMAIL_CHOICE_STORAGE_KEY } from './signupAttemptMarkers';
import { TERMS_GATE_STORAGE_KEY, TermsGate } from './TermsGate';

function GrantProbe() {
  const grant = useMarketingEmailGrant();
  return <p data-testid="grant-probe">{grant ?? 'no grant'}</p>;
}

function termsBox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /I agree to the Terms of Service/ });
}

function marketingEmailBox(): HTMLElement {
  return screen.getByRole('checkbox', { name: MARKETING_EMAIL_CONSENT_PURPOSE.label });
}

const YOUNGEST_ADMITTED = String(ACCOUNT_MINIMUM_AGE);
const TOO_YOUNG = String(ACCOUNT_MINIMUM_AGE - 1);

function ageField(): HTMLInputElement {
  return screen.getByLabelText(ACCOUNT_AGE_FIELD_LABEL) as HTMLInputElement;
}

async function enterAge(age: string = YOUNGEST_ADMITTED): Promise<void> {
  await userEvent.clear(ageField());
  if (age) await userEvent.type(ageField(), age);
}

function ageAlert(): HTMLElement | null {
  return within(screen.getByTestId('auth-age-field')).queryByRole('alert');
}

function renderAgeReview() {
  return render(
    <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue" confirmAge>
      <p role="status">Recording agreement</p>
    </TermsGate>,
  );
}

function renderReview(props: { offerMarketingEmail?: boolean; optedOutBySignal?: boolean } = {}) {
  return render(
    <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue" confirmAge {...props}>
      <GrantProbe />
    </TermsGate>,
  );
}

describe('terms confirmation', () => {
  beforeEach(() => window.localStorage.clear());

  it('asks for the terms and the age on the first screen and goes on only with the terms ticked and an eligible age', async () => {
    const user = userEvent.setup();
    renderAgeReview();

    const terms = termsBox();
    const age = ageField();
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(screen.getByText(FREE_PLAN_TRAINING_SIGNUP_STATEMENT)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toEqual([terms]);
    expect(age).toHaveValue('');
    expect(age).toHaveAccessibleDescription(ACCOUNT_AGE_REQUIREMENT_NOTICE);
    expect(age.compareDocumentPosition(terms) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Age requirements' })).toHaveAttribute(
      'href',
      '/terms#s-02',
    );
    expect(button).toBeDisabled();

    await enterAge();
    expect(button).toBeDisabled();
    await user.click(terms);
    expect(button).toBeEnabled();
    await user.click(terms);
    expect(button).toBeDisabled();
    await user.click(terms);
    expect(screen.queryByText('Recording agreement')).not.toBeInTheDocument();
    await user.click(button);

    expect(screen.getByText('Recording agreement')).toBeInTheDocument();
    expect(terms).toBeDisabled();
    expect(age).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it.each([
    ['an empty field', '', ACCOUNT_AGE_REQUIRED_MESSAGE],
    ['a word', 'ten', ACCOUNT_AGE_REQUIRED_MESSAGE],
    ['zero', '0', ACCOUNT_AGE_REQUIRED_MESSAGE],
    [`a ${TOO_YOUNG} year old`, TOO_YOUNG, ACCOUNT_AGE_INELIGIBLE_MESSAGE],
  ])(
    'refuses Continue for %s with the terms ticked, says why on the field, and goes on once corrected',
    async (_case, entry, message) => {
      const user = userEvent.setup();
      renderAgeReview();
      await user.click(termsBox());
      await enterAge(entry);
      expect(ageAlert()).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(screen.queryByText('Recording agreement')).not.toBeInTheDocument();
      expect(ageAlert()).toHaveTextContent(message);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(ageField()).toHaveAttribute('aria-invalid', 'true');
      expect(ageField()).toHaveFocus();
      expect(termsBox()).toBeEnabled();

      await enterAge();
      expect(ageAlert()).toBeNull();
      expect(ageField()).not.toHaveAttribute('aria-invalid');
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(screen.getByText('Recording agreement')).toBeInTheDocument();
    },
  );

  it.each([YOUNGEST_ADMITTED, String(PARENTAL_PERMISSION_BELOW_AGE - 1), '18'])(
    'goes on for a %s year old',
    async (age) => {
      const user = userEvent.setup();
      renderAgeReview();
      await enterAge(age);
      await user.click(termsBox());
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText('Recording agreement')).toBeInTheDocument();
    },
  );

  it('shows no refusal while an age is being typed, only for an attempt', async () => {
    renderAgeReview();

    await userEvent.type(ageField(), '1');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(ageField()).not.toHaveAttribute('aria-invalid');
  });

  it('keeps the age in the field and out of everything the step writes or hands on', async () => {
    window.sessionStorage.clear();
    const cookiesBefore = document.cookie;
    const addressBefore = window.location.href;
    const user = userEvent.setup();
    renderReview({ offerMarketingEmail: true });
    await enterAge('57');
    await user.click(termsBox());
    await user.click(marketingEmailBox());
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('grant-probe')).toHaveTextContent(POLICY_LAST_UPDATED.privacy);
    expect(ageField()).not.toHaveAttribute('name');
    expect({ ...window.localStorage }).toEqual({
      [TERMS_GATE_STORAGE_KEY]: POLICY_LAST_UPDATED.terms,
    });
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookiesBefore);
    expect(window.location.href).toBe(addressBefore);
  });

  it('works the same on a page with no scene, and is followed by the scene on a page with one', async () => {
    const bare = renderAgeReview();
    await enterAge(TOO_YOUNG);
    await userEvent.click(termsBox());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(ageAlert()).toHaveTextContent(ACCOUNT_AGE_INELIGIBLE_MESSAGE);
    bare.unmount();

    const store = createSceneStore();
    const noteCaret = vi.spyOn(store, 'noteCaret');
    render(
      <AuthSceneBridgeProvider value={store}>
        <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue" confirmAge>
          <p role="status">Recording agreement</p>
        </TermsGate>
      </AuthSceneBridgeProvider>,
    );
    await enterAge();
    await userEvent.click(termsBox());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(noteCaret).toHaveBeenCalledWith(ageField());
    expect(screen.getByText('Recording agreement')).toBeInTheDocument();
  });

  it('asks only for the terms when the page does not ask the age', () => {
    render(
      <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue">
        <p>Recording agreement</p>
      </TermsGate>,
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByLabelText(ACCOUNT_AGE_FIELD_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Age requirements' })).not.toBeInTheDocument();
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

describe('marketing email on the terms review screen', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'globalPrivacyControl');
  });

  it('is not asked unless the page offers it', () => {
    renderReview();

    expect(
      screen.queryByRole('checkbox', { name: MARKETING_EMAIL_CONSENT_PURPOSE.label }),
    ).toBeNull();
    expect(screen.getAllByRole('checkbox')).toEqual([termsBox()]);
    expect(ageField()).toBeInTheDocument();
  });

  it('offers one optional unticked box under the terms, which Continue never waits for', async () => {
    const user = userEvent.setup();
    renderReview({ offerMarketingEmail: true });
    const optional = marketingEmailBox();

    expect(optional).not.toBeChecked();
    expect(optional).not.toBeRequired();
    expect(screen.getAllByRole('checkbox')).toEqual([termsBox(), optional]);

    await user.click(optional);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.click(optional);
    await user.click(termsBox());
    await enterAge();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('grant-probe')).toHaveTextContent('no grant');
  });

  it('hands a ticked choice to the recorder with the notice version on screen, and then holds it', async () => {
    const user = userEvent.setup();
    renderReview({ offerMarketingEmail: true });

    await user.click(termsBox());
    await enterAge();
    await user.click(marketingEmailBox());
    expect(screen.queryByTestId('grant-probe')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('grant-probe')).toHaveTextContent(POLICY_LAST_UPDATED.privacy);
    expect(marketingEmailBox()).toBeChecked();
    expect(marketingEmailBox()).toBeDisabled();
    expect(window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
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
    window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);
    renderReview({ offerMarketingEmail: true });

    await userEvent.click(termsBox());

    expect(window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
    expect(marketingEmailBox()).not.toBeChecked();
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
      renderReview({ offerMarketingEmail: true, ...props });
      const optional = marketingEmailBox();

      expect(optional).toHaveAttribute('aria-disabled', 'true');
      expect(optional).toHaveAccessibleDescription(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE);
      optional.focus();
      expect(optional).toHaveFocus();

      await user.keyboard(' ');
      await user.click(optional);
      await user.click(termsBox());
      await enterAge();
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(optional).not.toBeChecked();
      expect(screen.getByTestId('grant-probe')).toHaveTextContent('no grant');
    },
  );
});
