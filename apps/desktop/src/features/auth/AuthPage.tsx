import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, CheckCircle2, KeyRound, Laptop, Loader2, Shield } from 'lucide-react';
import { AuthForm } from './AuthForm';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { Button } from '@/components/ui/Button';
import { getSimpleErrorMessage } from '../../lib/errorMessages';

interface AuthPageProps {
  onAuthSuccess?: () => void;
}

type PageState = 'auth' | 'verifying' | 'verified' | 'error';

const cloudSyncPoints = [
  {
    icon: Bot,
    title: 'Cloud workspace',
    description: 'Chats and projects sync across AGI web, desktop, and mobile.',
  },
  {
    icon: Laptop,
    title: 'Local remains available',
    description: 'Desktop local mode keeps working with local models when you are signed out.',
  },
  {
    icon: KeyRound,
    title: 'BYOK stays yours',
    description: 'Provider keys remain user-controlled; AGI Cloud is a separate account mode.',
  },
];

export function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [pageState, setPageState] = useState<PageState>('auth');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const scheduleTimeout = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timeoutIdsRef.current.push(id);
      return id;
    };

    const processAuthParams = (params: Record<string, string>) => {
      const type = params['type'];
      const accessToken = params['access_token'];
      const refreshToken = params['refresh_token'];
      const errorDescription = params['error_description'];
      const errorCode = params['error'];
      const code = params['code'];

      if (errorDescription || errorCode) {
        const message = errorDescription
          ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
          : errorCode;
        setErrorMessage(message || 'OAuth sign-in failed.');
        setPageState('error');
        return;
      }

      if (accessToken && refreshToken) {
        // Manually set session if tokens are present
        cloudAccountAuth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }

      if (code && !accessToken) {
        setPageState('verifying');
        cloudAccountAuth.exchangeCodeForSession(code).then((response) => {
          if (response.error) {
            setErrorMessage(getSimpleErrorMessage(response.error));
            setPageState('error');
            return;
          }

          setPageState('verified');
          window.history.replaceState(null, '', window.location.pathname);
          scheduleTimeout(() => {
            onAuthSuccess?.();
          }, 500);
        });
        return;
      }

      if (
        (type === 'signup' || type === 'magiclink' || type === 'invite' || type === 'recovery') &&
        accessToken
      ) {
        setPageState('verifying');

        scheduleTimeout(() => {
          const isAuth = cloudAccountAuth.isAuthenticated();
          if (isAuth) {
            setPageState('verified');
            // Clear URL hash
            window.history.replaceState(null, '', window.location.pathname);

            scheduleTimeout(() => {
              onAuthSuccess?.();
            }, 2000);
          } else {
            // Retry session check just in case
            cloudAccountAuth.checkSession().then(() => {
              if (cloudAccountAuth.isAuthenticated()) {
                setPageState('verified');
                onAuthSuccess?.();
              } else {
                setPageState('auth');
              }
            });
          }
        }, 1000);
        return;
      }

      // Default case if just access token without specific type (e.g. OAuth implicit)
      if (accessToken) {
        setPageState('verifying');
        scheduleTimeout(() => {
          if (cloudAccountAuth.isAuthenticated()) {
            setPageState('verified');
            onAuthSuccess?.();
          } else {
            cloudAccountAuth.checkSession().then(() => {
              if (cloudAccountAuth.isAuthenticated()) {
                setPageState('verified');
                onAuthSuccess?.();
              } else {
                setPageState('auth');
              }
            });
          }
        }, 1000);
      }
    };

    // 1. Check window hash on mount (for web or if opened directly)
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      processAuthParams(Object.fromEntries(params.entries()));
    }

    // 2. Listen for deep link events (for desktop app)
    const handleDeepLink = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        console.debug('[AuthPage] Received deep link event', customEvent.detail);
        processAuthParams(customEvent.detail);
      }
    };

    window.addEventListener('agi-deep-link', handleDeepLink);

    return () => {
      window.removeEventListener('agi-deep-link', handleDeepLink);
      timeoutIdsRef.current.forEach(clearTimeout);
      timeoutIdsRef.current = [];
    };
  }, [onAuthSuccess]);

  if (pageState === 'verified') {
    return (
      <div className="flex h-full min-h-full items-center justify-center bg-background p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500"
          >
            <CheckCircle2 className="h-10 w-10 text-white" />
          </motion.div>
          <h1 className="mb-4 text-3xl font-bold text-foreground">Email verified</h1>
          <p className="text-muted-foreground mb-6">
            Your account has been verified successfully. You'll be redirected to AGI shortly.
          </p>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Redirecting...</span>
          </div>
        </motion.div>
      </div>
    );
  }

  if (pageState === 'verifying') {
    return (
      <div className="flex h-full min-h-full items-center justify-center bg-background p-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-foreground" />
          <p className="text-muted-foreground">Verifying your account...</p>
        </motion.div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex h-full min-h-full items-center justify-center bg-background p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl"
        >
          <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <Shield className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mb-4 text-2xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground mb-6">
            {errorMessage || 'An error occurred during authentication.'}
          </p>
          <Button
            onClick={() => {
              setPageState('auth');
              setErrorMessage(null);
              window.history.replaceState(null, '', window.location.pathname);
            }}
            className="w-full bg-foreground text-background hover:bg-foreground/90"
          >
            Try again
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-full bg-background">
      <aside className="hidden w-[42%] min-w-[360px] border-r border-border bg-muted/20 lg:flex">
        <div className="flex w-full flex-col justify-center px-12 py-10 text-foreground">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-10 flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background">
              <Bot className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight">AGI</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-10"
          >
            <h1 className="mb-4 max-w-md text-4xl font-semibold leading-tight tracking-tight">
              Sign in to sync your AGI workspace.
            </h1>
            <p className="max-w-md text-base leading-7 text-muted-foreground">
              Cloud mode stores chats, projects, and account settings in your AGI workspace so the
              same context follows you across surfaces.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-4"
          >
            {cloudSyncPoints.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="flex items-start gap-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                  <feature.icon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-medium text-foreground">{feature.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mt-10 border-t border-border pt-6"
          >
            <div className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
              <Shield className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Local and BYOK work remain available without signing in. Managed cloud features use
                your signed-in AGI account.
              </span>
            </div>
          </motion.div>
        </div>
      </aside>

      <main className="relative flex flex-1 items-center justify-center p-8">
        <div className="absolute left-6 top-6 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <Bot className="h-4 w-4" />
            </div>
            <span className="font-bold text-foreground">AGI</span>
          </div>
        </div>

        <AuthForm onSuccess={onAuthSuccess} className="w-full max-w-md" />
      </main>
    </div>
  );
}

export default AuthPage;
