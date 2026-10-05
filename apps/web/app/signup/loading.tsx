import { RouteLoading } from '@shared/components/RouteLoading';
import { AuthLayout } from '@/features/auth/AuthLayout';

export default function SignupLoading() {
  return (
    <AuthLayout scene>
      <RouteLoading label="Loading sign up" inline />
    </AuthLayout>
  );
}
