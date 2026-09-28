import { AuthLayout } from '@/features/auth/AuthLayout';
import { buildLoginCompleteUrl, buildLoginUrl } from '@/features/auth/authRoutes';
import { DesktopSignInComplete } from './DesktopSignInComplete';

const DESKTOP_HOME = '/chat';

export default function DesktopSignInCompletePage() {
  const context = { redirectTo: DESKTOP_HOME, desktopSurface: true, authRetry: false };
  return (
    <AuthLayout embedded>
      <DesktopSignInComplete
        completeUrl={buildLoginCompleteUrl(context)}
        loginUrl={buildLoginUrl(context)}
      />
    </AuthLayout>
  );
}
