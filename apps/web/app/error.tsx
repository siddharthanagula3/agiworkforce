'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';
import { getFriendlyError } from '@agiworkforce/utils';
import { useUiTranslation } from '@agiworkforce/ui/i18n';
import { AgiMark } from '@agiworkforce/ui/agi-mark';
import { logger } from '@shared/lib/logger';
import { PRODUCT_HOME_PATH } from '@/features/desktop-host/lib/deep-links';
import { useHomeHref } from '@/features/desktop-host/hooks/use-home-href';
import { useFriendlyErrorCopy } from '@/shared/hooks/use-friendly-error-copy';

const SIGN_IN_HREF = '/login';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Unhandled Next.js error boundary caught', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  const { t } = useUiTranslation('errors');
  const friendlyError = getFriendlyError(error);
  const friendly = useFriendlyErrorCopy(friendlyError);
  const homeHref = useHomeHref();
  const signInAction = friendlyError.icon === 'auth' && friendlyError.title === 'Sign In Required';

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main-content" className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 text-center">
          <div className="mb-8">
            <div
              className="w-24 h-24 rounded-full bg-destructive/10 mx-auto mb-6 flex items-center justify-center"
              aria-hidden="true"
            >
              <AlertTriangle className="h-12 w-12 text-danger" />
            </div>
            <h1 className="text-display mb-4">{friendly.title}</h1>
            <p className="text-muted-foreground max-w-md mx-auto mb-2">{friendly.message}</p>
            {friendly.suggestion && (
              <p className="text-muted-foreground max-w-md mx-auto mb-2">{friendly.suggestion}</p>
            )}
            {error.digest && (
              <p className="text-muted-foreground text-sm mb-8">
                {t('boundary.supportReference', 'Reference for support: {{reference}}', {
                  reference: error.digest,
                })}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={reset}
              className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-4 w-4 me-2" aria-hidden="true" />
              {t('boundary.tryAgain', 'Try again')}
            </button>
            <Link
              href={homeHref}
              className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-8 text-sm font-medium text-foreground no-underline hover:bg-muted transition-colors"
            >
              <Home className="h-4 w-4 me-2" aria-hidden="true" />
              {homeHref === PRODUCT_HOME_PATH
                ? t('boundary.goToChat', 'Go to chat')
                : t('boundary.goHome', 'Go home')}
            </Link>
            {signInAction && (
              <Link
                href={SIGN_IN_HREF}
                className="inline-flex h-12 items-center justify-center rounded-full bg-secondary px-8 text-sm font-medium text-secondary-foreground no-underline hover:bg-secondary/80 transition-colors"
              >
                {t('boundary.signIn', 'Sign in')}
              </Link>
            )}
          </div>

          <div className="mt-16 pt-8 border-t border-border">
            <p className="text-muted-foreground text-sm">
              {t('boundary.keepsHappening', 'If this keeps happening,')}{' '}
              <Link href="/contact" className="text-primary hover:opacity-80">
                {t('boundary.contactSupport', 'contact support')}
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      <footer data-surface="web" className="border-t border-border bg-background py-8">
        <div className="container mx-auto px-4 flex flex-col items-center gap-4">
          <AgiMark size={20} mono className="text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
