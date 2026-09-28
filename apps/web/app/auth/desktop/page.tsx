import { AuthLayout } from '@/features/auth/AuthLayout';
import { isDesktopSignInChallenge } from '@/lib/server/desktop-sign-in';
import { DesktopSignInHandoff } from './DesktopSignInHandoff';

export default async function DesktopSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  const { challenge } = await searchParams;
  return (
    <AuthLayout>
      <DesktopSignInHandoff challenge={isDesktopSignInChallenge(challenge) ? challenge : null} />
    </AuthLayout>
  );
}
