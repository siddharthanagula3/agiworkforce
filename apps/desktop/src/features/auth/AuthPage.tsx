import { useEffect, useRef, useState } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  LogIn,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { Button } from '@/components/ui/Button';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { useAuthStore } from '../../stores/auth';
import { useAppModeStore } from '../../stores/appModeStore';
import { AgiMark } from '@agiworkforce/ui';

interface AuthPageProps {
  onAuthSuccess?: () => void;
}

type PageState = 'auth' | 'verifying' | 'verified' | 'error';

const trustPoints = [
  {
    icon: Lock,
    label: 'Local stays local',
    description: 'Local mode never leaves your device — no account required.',
  },
  {
    icon: KeyRound,
    label: 'BYOK on Desktop + CLI',
    description: 'Your provider keys are user-controlled and never stored by AGI Cloud.',
  },
  {
    icon: Sparkles,
    label: 'Cloud on every surface',
    description:
      'AGI Cloud is in public alpha — sign in to sync your chats across desktop, web, and mobile.',
  },
];

type MotionVariant = Partial<Pick<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'transition'>>;

/** Framer Motion variants — collapse to no-op when reduced-motion is preferred */
function useMotionVariants(): { fadeUp: MotionVariant; scaleIn: MotionVariant } {
  const reduced =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  if (reduced) {
    return { fadeUp: {}, scaleIn: {} };
  }
  return {
    fadeUp: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
    },
    scaleIn: {
      initial: { scale: 0 },
      animate: { scale: 1 },
      transition: { type: 'spring', delay: 0.2 },
    },
  };
}

function DeviceSignInCard({ onSuccess }: { onSuccess?: () => void }) {
  const signIn = useAuthStore((state) => state.signIn);
  const setMode = useAppModeStore((state) => state.setMode);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginSignIn = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setError(null);
    try {
      // Credentials are intentionally empty: primary authentication happens
      // in an isolated AGI Desktop sign-in window, and the main Desktop
      // webview receives only a revocable device credential after approval.
      const result = await signIn('', '');
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    } catch (signInError) {
      setError(getSimpleErrorMessage(signInError));
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-xl shadow-black/5"
    >
      <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background">
        <AgiMark size={24} ariaLabel="AGI" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Sign in to AGI Cloud
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Sign in directly in AGI Desktop. Your Cloud workspace opens here when authorization is
        complete.
      </p>

      <div className="my-6 rounded-xl border border-border bg-muted/35 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">Private in-app sign-in</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Your password stays inside AGI&apos;s secure sign-in window. Desktop receives a
              short-lived, revocable session stored in your system credential vault.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <Button
        type="button"
        className="h-11 w-full"
        disabled={isConnecting}
        aria-busy={isConnecting}
        onClick={() => void beginSignIn()}
      >
        {isConnecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign in to AGI Cloud
          </>
        )}
      </Button>

      {isConnecting ? (
        <p className="mt-3 text-center text-xs text-muted-foreground" role="status">
          Complete sign-in in the AGI window.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setMode('local')}
        className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Use Local Mode
      </button>
    </motion.div>
  );
}

export function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [pageState, setPageState] = useState<PageState>('auth');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { fadeUp, scaleIn } = useMotionVariants();

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
            window.history.replaceState(null, '', window.location.pathname);

            scheduleTimeout(() => {
              onAuthSuccess?.();
            }, 2000);
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
        return;
      }

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

    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      processAuthParams(Object.fromEntries(params.entries()));
    }

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

  /* ------------------------------------------------------------------ */
  /* Deep-link state screens                                              */
  /* ------------------------------------------------------------------ */

  if (pageState === 'verifying') {
    return (
      <div className="flex h-full min-h-full items-center justify-center bg-background p-8">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-5 text-center"
          role="status"
          aria-live="polite"
          aria-label="Verifying your account"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card shadow-sm">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-medium text-foreground">Verifying your account</p>
            <p className="mt-1 text-sm text-muted-foreground">This will only take a moment.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (pageState === 'verified') {
    return (
      <div className="flex h-full min-h-full items-center justify-center bg-background p-8">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-5 text-center"
          role="status"
          aria-live="polite"
          aria-label="Account verified"
        >
          <motion.div
            {...scaleIn}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-sm"
          >
            <CheckCircle2 className="h-8 w-8 text-white" aria-hidden="true" />
          </motion.div>
          <div>
            <p className="text-base font-medium text-foreground">Account verified</p>
            <p className="mt-1 text-sm text-muted-foreground">Signing you in to AGI now&hellip;</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-hidden="true">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Redirecting</span>
          </div>
        </motion.div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex h-full min-h-full items-center justify-center bg-background p-8">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.3 }}
          className="w-full max-w-sm"
          role="alert"
        >
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
            <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
            </div>
            <h1 className="mb-2 text-xl font-semibold text-foreground">Authentication failed</h1>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              {errorMessage || 'An error occurred during sign-in. Please try again.'}
            </p>
            <Button
              onClick={() => {
                setPageState('auth');
                setErrorMessage(null);
                window.history.replaceState(null, '', window.location.pathname);
              }}
              className="w-full"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Main auth layout: split left aside + right form                     */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex h-full min-h-full bg-background">
      {/* ---- Left marketing aside (hidden on small screens) ---- */}
      <aside
        className="hidden w-[42%] min-w-[360px] flex-col justify-between border-r border-border bg-muted/20 px-12 py-10 lg:flex"
        aria-label="AGI Cloud overview"
      >
        {/* Brand mark */}
        <motion.div
          {...fadeUp}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="flex items-center gap-2.5"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background"
            aria-hidden="true"
          >
            <AgiMark size={20} mono />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">AGI</span>
        </motion.div>

        {/* Headline + sub-copy */}
        <motion.div {...fadeUp} transition={{ delay: 0.25, duration: 0.4 }} className="-mt-6">
          <h1 className="mb-3 max-w-xs text-[2.1rem] font-semibold leading-tight tracking-tight text-foreground">
            Beyond one model.
            <br />
            Beyond one surface.
          </h1>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            AGI brings 10+ AI providers into a single workspace — desktop, mobile, web, CLI,
            VS&nbsp;Code, and Chrome. Your context, everywhere.
          </p>
        </motion.div>

        {/* Trust-mode points */}
        <motion.ul
          {...fadeUp}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="space-y-4"
          aria-label="How AGI keeps your data safe"
        >
          {trustPoints.map((point, i) => (
            <motion.li
              key={point.label}
              {...fadeUp}
              transition={{ delay: 0.45 + i * 0.08, duration: 0.3 }}
              className="flex items-start gap-3"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
                aria-hidden="true"
              >
                <point.icon className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{point.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {point.description}
                </p>
              </div>
            </motion.li>
          ))}
        </motion.ul>

        {/* Six-surface footer line */}
        <motion.div
          {...fadeUp}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="flex items-center gap-2 border-t border-border pt-6"
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3 w-3" aria-hidden="true" />
            </span>{' '}
            Available on Desktop · Mobile · Web · CLI · VS&nbsp;Code · Chrome
          </p>
        </motion.div>
      </aside>

      {/* ---- Right form column ---- */}
      <main className="relative flex flex-1 items-center justify-center p-8">
        {/* Mobile-only brand mark */}
        <div className="absolute left-6 top-6 lg:hidden" aria-hidden="true">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <AgiMark size={18} mono />
            </div>
            <span className="font-semibold text-foreground">AGI</span>
          </div>
        </div>

        <DeviceSignInCard onSuccess={onAuthSuccess} />
      </main>
    </div>
  );
}

export default AuthPage;
