import type { ReactNode } from 'react';

import './auth.css';
import { AuthBrand } from './AuthBrand';
import { AUTH_COLUMN_CLASS, AUTH_PAGE_CLASS } from './authStyles';

export function AuthLayout({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  return (
    <div
      className={AUTH_PAGE_CLASS}
      data-auth-column=""
      data-testid="auth-layout"
      data-embedded={String(embedded)}
    >
      <AuthBrand />
      <div className={AUTH_COLUMN_CLASS}>{children}</div>
    </div>
  );
}
