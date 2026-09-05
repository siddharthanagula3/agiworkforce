import './auth.css';
import { AuthBrand } from './AuthBrand';
import { NativeSignInCard } from './NativeSignInCard';
import { AUTH_COLUMN_CLASS, AUTH_PAGE_CLASS } from './authStyles';

interface AuthPageProps {
  onAuthSuccess?: () => void;
}

export function AuthPage({ onAuthSuccess }: AuthPageProps) {
  return (
    <div className={AUTH_PAGE_CLASS} data-auth-column="" data-testid="auth-layout">
      <AuthBrand />
      <div className={AUTH_COLUMN_CLASS}>
        <NativeSignInCard onSuccess={onAuthSuccess} />
      </div>
    </div>
  );
}

export default AuthPage;
