'use client';

import { useEffect } from 'react';

import { TermsGate } from '@/app/signup/TermsGate';
import { AuthCodeStep } from '@/features/auth/AuthCodeStep';
import { AuthEmailStep } from '@/features/auth/AuthEmailStep';
import { AuthNewPasswordStep } from '@/features/auth/AuthNewPasswordStep';
import { AuthPasswordStep } from '@/features/auth/AuthPasswordStep';
import { AuthPhaseStatus } from '@/features/auth/AuthPhaseStatus';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';
import type {
  AuthCodeScreen,
  AuthMode,
  AuthPhase,
  AuthProvider,
} from '@/features/auth/authContract';
import { useAuthSceneBridge } from '@/features/auth/scene/AuthSceneContext';

export type HarnessStep = 'email' | 'password' | 'code' | 'new_password' | 'terms';
export type HarnessState = 'idle' | 'pending' | 'error' | 'success';
export type HarnessErrorField = 'email' | 'password';

const PROBE_EMAIL = 'person@example.invalid';
const PROBE_ERROR = 'The email and password do not match an account.';
const TERMS_HEADING = 'Finish signing in';
const TERMS_DETAIL = 'Review and accept our terms to continue to your account.';
const TERMS_CONFIRMATION = 'Continue';

const none = () => undefined;

export function AuthSceneHarness({
  step,
  mode,
  state,
  providers,
  passkey = false,
  codeScreen = 'sign_in',
  errorField = 'email',
}: {
  step: HarnessStep;
  mode: AuthMode;
  state: HarnessState;
  providers: readonly AuthProvider[];
  passkey?: boolean;
  codeScreen?: AuthCodeScreen;
  errorField?: HarnessErrorField;
}) {
  const scene = useAuthSceneBridge();
  const phase: AuthPhase = state === 'pending' ? 'verifying' : 'idle';
  const fieldError = state === 'error' ? PROBE_ERROR : null;
  const emailRefused = state === 'error' && errorField === 'email';

  useEffect(() => {
    if (state === 'success') {
      scene.setMood('neutral');
      scene.celebrate();
      return;
    }
    scene.setMood(state === 'idle' ? 'neutral' : state);
  }, [scene, state]);

  if (step === 'terms') {
    return (
      <AuthStepFrame heading={TERMS_HEADING} detail={<p>{TERMS_DETAIL}</p>}>
        <TermsGate
          restorePreAuthMarker={false}
          confirmationLabel={TERMS_CONFIRMATION}
          confirmAge={mode === 'signup'}
          offerMarketingEmail={mode === 'signup'}
        >
          <AuthPhaseStatus phase="signing_in" />
        </TermsGate>
      </AuthStepFrame>
    );
  }
  if (step === 'password') {
    return (
      <AuthPasswordStep
        email={PROBE_EMAIL}
        phase={phase}
        error={null}
        fieldError={fieldError}
        methods={['email_code']}
        onSubmit={none}
        onEditEmail={none}
        onForgotPassword={none}
        onChooseMethod={none}
      />
    );
  }
  if (step === 'code') {
    return (
      <AuthCodeStep
        email={PROBE_EMAIL}
        purpose={codeScreen}
        phase={phase}
        error={null}
        fieldError={fieldError}
        onSubmit={none}
        onResend={none}
        onEditEmail={codeScreen === 'confirm_email' ? undefined : none}
      />
    );
  }
  if (step === 'new_password') {
    return (
      <AuthNewPasswordStep
        email={PROBE_EMAIL}
        purpose={mode === 'signup' ? 'sign_up' : 'reset'}
        phase={phase}
        error={null}
        fieldError={fieldError}
        onSubmit={none}
        onEditEmail={mode === 'signup' ? none : undefined}
      />
    );
  }
  return (
    <AuthEmailStep
      mode={mode}
      providers={providers}
      switchUrl={mode === 'login' ? '/signup' : '/login'}
      ready
      phase={state === 'pending' ? 'checking_account' : 'idle'}
      error={null}
      fieldError={emailRefused ? 'No account uses this email.' : null}
      passwordError={emailRefused ? null : fieldError}
      switchOffered={emailRefused}
      providerPending={null}
      onSubmit={none}
      onSubmitPassword={none}
      onForgotPassword={none}
      onStartProvider={none}
      passkeySignIn={passkey}
      onStartPasskey={none}
    />
  );
}
