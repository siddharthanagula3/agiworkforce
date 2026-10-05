import { notFound } from 'next/navigation';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { configuredAuthProviders } from '@/features/auth/authProviderConfig';

import { AuthSceneHarness, type HarnessState, type HarnessStep } from './AuthSceneHarness';

const STEPS: readonly HarnessStep[] = ['email', 'password', 'code', 'new_password', 'terms'];
const STATES: readonly HarnessState[] = ['idle', 'pending', 'error', 'success'];
const CODE_SCREENS = ['sign_in', 'device', 'confirm_email', 'passwordless'] as const;
const ERROR_FIELDS = ['email', 'password'] as const;

function pick<T extends string>(raw: string | undefined, allowed: readonly T[]): T {
  return allowed.find((candidate) => candidate === raw) ?? allowed[0]!;
}

export default async function AuthSceneProbe({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string;
    mode?: string;
    state?: string;
    passkey?: string;
    screen?: string;
    field?: string;
  }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  return (
    <AuthLayout scene>
      <AuthSceneHarness
        step={pick(params.step, STEPS)}
        mode={params.mode === 'signup' ? 'signup' : 'login'}
        state={pick(params.state, STATES)}
        providers={configuredAuthProviders()}
        passkey={params.passkey === '1'}
        codeScreen={pick(params.screen, CODE_SCREENS)}
        errorField={pick(params.field, ERROR_FIELDS)}
      />
    </AuthLayout>
  );
}
