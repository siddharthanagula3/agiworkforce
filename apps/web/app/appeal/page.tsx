import { AuthLayout } from '@/features/auth/AuthLayout';
import { AuthLegalFooter } from '@/features/auth/AuthLegalFooter';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';
import { SuspensionAppeal } from '@/features/auth/SuspensionAppeal';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Appeal a suspension',
  description:
    'Appeal the suspension of your AGI Workforce account. A person reviews every appeal and replies to the account email address.',
  path: '/appeal',
});

export default function AppealPage() {
  return (
    <AuthLayout>
      <AuthStepFrame
        heading="Appeal a suspension"
        detail={
          <p>
            Accounts are suspended for a breach of our Terms of Service or Acceptable Use Policy. If
            you can still sign in, sign in to appeal and follow the replies there.
          </p>
        }
        footer={<AuthLegalFooter />}
      >
        <SuspensionAppeal signedIn={false} />
      </AuthStepFrame>
    </AuthLayout>
  );
}
