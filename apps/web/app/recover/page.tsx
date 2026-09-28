import { AccountRecoveryForm, type RecoveryLoss } from '@/features/auth/AccountRecoveryForm';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { AuthLegalFooter } from '@/features/auth/AuthLegalFooter';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Recover your account',
  description:
    'Lost your password, the email address on your account, or your two-factor device? Ask for account recovery and a person will verify the account is yours.',
  path: '/recover',
});

function lossFrom(raw: string | undefined): RecoveryLoss {
  return raw === 'email' || raw === 'factor' ? raw : 'password';
}

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ lost?: string }>;
}) {
  const { lost } = await searchParams;
  return (
    <AuthLayout>
      <AuthStepFrame
        heading="Recover your account"
        detail={
          <p className="text-center">
            Try Forgot password or a backup code first. If neither works, tell us what you lost and
            a person will verify the account is yours before restoring access. An account with
            Advanced Account Security recovers only with a recovery key.
          </p>
        }
        footer={<AuthLegalFooter />}
      >
        <AccountRecoveryForm initialLoss={lossFrom(lost)} />
      </AuthStepFrame>
    </AuthLayout>
  );
}
