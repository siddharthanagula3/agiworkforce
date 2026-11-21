import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ACCOUNT_AGE_FIELD_LABEL } from '@agiworkforce/types';
import { AuthSceneBridgeProvider, createSceneStore } from '@agiworkforce/ui/auth-scene';

import { useMarketingEmailGrant } from '@/features/auth/marketingEmailChoice';
import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE } from '@/lib/consent-signals';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { AGE_CHECK_STORAGE_KEY, MARKETING_EMAIL_CHOICE_STORAGE_KEY } from './signupAttemptMarkers';
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

function renderReview(props: { offerMarketingEmail?: boolean; optedOutBySignal?: boolean } = {}) {
  return render(
    <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue" {...props}>
      <GrantProbe />
    </TermsGate>,
  );
}

function expectNoAgeQuestion(): void {
  expect(screen.queryByLabelText(ACCOUNT_AGE_FIELD_LABEL)).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Age requirements' })).not.toBeInTheDocument();
}

describe('terms confirmation', () => {
  beforeEach(() => window.localStorage.clear());

  it('asks for the terms alone on the first screen and goes on only with the terms ticked', async () => {
    const user = userEvent.setup();
    render(
      <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue">
        <p role="status">Recording agreement</p>
      </TermsGate>,
    );

    const terms = termsBox();
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(screen.queryByText(/train/i)).toBeNull();
    expect(screen.getAllByRole('checkbox')).toEqual([terms]);
    expectNoAgeQuestion();
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
    expectNoAgeQuestion();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('writes the terms marker with no age check, and forgets one an earlier attempt left', async () => {
    window.localStorage.setItem(AGE_CHECK_STORAGE_KEY, '18');
    const user = userEvent.setup();
    renderReview();

    await user.click(termsBox());

    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(window.localStorage.getItem(AGE_CHECK_STORAGE_KEY)).toBeNull();
  });

  it('keeps everything the step writes or hands on to the terms marker alone', async () => {
    window.sessionStorage.clear();
    const cookiesBefore = document.cookie;
    const addressBefore = window.location.href;
    const user = userEvent.setup();
    renderReview({ offerMarketingEmail: true });
    await user.click(termsBox());
    await user.click(marketingEmailBox());
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('grant-probe')).toHaveTextContent(POLICY_LAST_UPDATED.privacy);
    expect({ ...window.localStorage }).toEqual({
      [TERMS_GATE_STORAGE_KEY]: POLICY_LAST_UPDATED.terms,
    });
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookiesBefore);
    expect(window.location.href).toBe(addressBefore);
  });

  it('works the same on a page with no scene and on a page with one', async () => {
    const bare = render(
      <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue">
        <p role="status">Recording agreement</p>
      </TermsGate>,
    );
    await userEvent.click(termsBox());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Recording agreement')).toBeInTheDocument();
    bare.unmount();

    const store = createSceneStore();
    const noteCaret = vi.spyOn(store, 'noteCaret');
    render(
      <AuthSceneBridgeProvider value={store}>
        <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue">
          <p role="status">Recording agreement</p>
        </TermsGate>
      </AuthSceneBridgeProvider>,
    );
    await userEvent.click(termsBox());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(noteCaret).not.toHaveBeenCalled();
    expect(screen.getByText('Recording agreement')).toBeInTheDocument();
    expectNoAgeQuestion();
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
    expectNoAgeQuestion();
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
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('grant-probe')).toHaveTextContent('no grant');
  });

  it('hands a ticked choice to the recorder with the notice version on screen, and then holds it', async () => {
    const user = userEvent.setup();
    renderReview({ offerMarketingEmail: true });

    await user.click(termsBox());
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
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(optional).not.toBeChecked();
      expect(screen.getByTestId('grant-probe')).toHaveTextContent('no grant');
    },
  );
});
