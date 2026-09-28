import { redirect } from 'next/navigation';
import { DESKTOP_SIGN_IN_PATH } from '@agiworkforce/local-runtime-contract';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { getRequestIdentity } from '@/lib/server/identity';
import { isDesktopSignInChallenge } from '@/lib/server/desktop-sign-in';
import { DesktopSignInHandoff } from './DesktopSignInHandoff';

async function hasVerifiedSession(): Promise<boolean> {
  try {
    return Boolean((await getRequestIdentity()).subject);
  } catch {
    return false;
  }
}

export default async function DesktopSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  const { challenge } = await searchParams;
  if (!isDesktopSignInChallenge(challenge)) {
    return (
      <AuthLayout>
        <DesktopSignInHandoff challenge={null} />
      </AuthLayout>
    );
  }

  if (!(await hasVerifiedSession())) {
    const returnTo = `${DESKTOP_SIGN_IN_PATH}?${new URLSearchParams({ challenge }).toString()}`;
    redirect(`/login?${new URLSearchParams({ redirectTo: returnTo }).toString()}`);
  }

  return (
    <AuthLayout>
      <DesktopSignInHandoff challenge={challenge} />
    </AuthLayout>
  );
}
