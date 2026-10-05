import { RouteLoading } from '@shared/components/RouteLoading';
import { AuthLayout } from '@/features/auth/AuthLayout';

export default function LoginLoading() {
  return (
    <AuthLayout scene>
      <RouteLoading label="Loading sign in" inline />
    </AuthLayout>
  );
}
