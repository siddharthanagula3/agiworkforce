import { useShallow } from 'zustand/react/shallow';
import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useReducedMotion } from '@agiworkforce/unified-chat';
import { cn } from '../../lib/utils';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { useAuthStore } from '../../stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { WEB_APP_URL } from '../../api/config';

type AuthMode =
  | 'signin'
  | 'signup'
  | 'magic-link'
  | 'reset-password'
  | 'email-verification-sent'
  | 'magic-link-sent'
  | 'reset-link-sent'
  | 'set-new-password';

interface AuthFormProps {
  onSuccess?: () => void;
  defaultMode?: AuthMode;
  className?: string;
}

interface AuthFormState {
  error: string | null;
  /** 202 = browser-handoff instruction, not a real error */
  isHandoff: boolean;
  success: boolean;
  mode?: AuthMode;
}

/** Detect the browser-handoff instruction coming back as AuthError(202) */
function isHandoffMessage(msg: string | null): boolean {
  if (!msg) return false;
  return (
    msg.includes('Continue sign-in in AGI web') ||
    msg.includes('Continue sign-up in AGI web') ||
    msg.includes('approve this desktop device')
  );
}

// Use Framer Motion's own types so spreads are always assignable to motion.div props.
type MotionVariant = Partial<
  Pick<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit' | 'transition'>
>;

/** Return motion props verbatim, or an empty object when reduced-motion is preferred. */
function motionProps(reduced: boolean, normal: MotionVariant): MotionVariant {
  if (reduced) return {};
  return normal;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.78-.07-1.54-.2-2.27H12v4.29h5.37a4.59 4.59 0 0 1-1.99 3.01v2.5h3.22c1.88-1.73 3-4.28 3-7.53z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.89 6.61-2.42l-3.22-2.5c-.89.6-2.03.95-3.39.95-2.61 0-4.82-1.76-5.61-4.13H3.06v2.58A10 10 0 0 0 12 22z"
      />
      <path
        fill="#FBBC04"
        d="M6.39 13.9a6.01 6.01 0 0 1 0-3.8V7.52H3.06a10 10 0 0 0 0 8.96l3.33-2.58z"
      />
      <path
        fill="#EA4335"
        d="M12 5.97c1.47 0 2.79.51 3.82 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2 10 10 0 0 0 3.06 7.52l3.33 2.58C7.18 7.73 9.39 5.97 12 5.97z"
      />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M12 .5C5.65.5.8 5.35.8 11.32c0 4.78 3.1 8.83 7.4 10.26.55.1.75-.23.75-.51 0-.25-.01-.93-.01-1.82-3.01.62-3.65-1.24-3.65-1.24-.49-1.18-1.2-1.49-1.2-1.49-.98-.64.07-.63.07-.63 1.08.07 1.65 1.07 1.65 1.07.96 1.58 2.52 1.12 3.14.86.1-.67.38-1.12.68-1.38-2.4-.26-4.93-1.15-4.93-5.12 0-1.13.42-2.06 1.1-2.79-.11-.26-.48-1.32.11-2.75 0 0 .9-.28 2.94 1.06.86-.23 1.77-.35 2.68-.35.91 0 1.82.12 2.68.35 2.04-1.34 2.94-1.06 2.94-1.06.59 1.43.22 2.49.11 2.75.68.73 1.1 1.66 1.1 2.79 0 3.98-2.54 4.85-4.96 5.11.39.32.73.96.73 1.94 0 1.4-.01 2.53-.01 2.87 0 .28.2.61.75.51 4.3-1.43 7.39-5.48 7.39-10.25C23.2 5.35 18.35.5 12 .5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable banner components                                           */
/* ------------------------------------------------------------------ */

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
    >
      <span className="mt-0.5 shrink-0 text-destructive/70" aria-hidden="true">
        &#9888;
      </span>
      <span>{message}</span>
    </div>
  );
}

function HandoffBanner({ email }: { email: string }) {
  const webUrl = email
    ? `${WEB_APP_URL}/sign-in?email=${encodeURIComponent(email)}&surface=desktop`
    : `${WEB_APP_URL}/sign-in?surface=desktop`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-3.5 py-3"
    >
      <div className="flex items-start gap-2.5 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          Your browser opened AGI&nbsp;web. Complete sign-in there, then return to this window — the
          desktop will be linked automatically.
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-full text-xs"
        onClick={() => window.open(webUrl, '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        Open AGI Web
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "Sent" confirmation screens (email-verification, magic-link, reset) */
/* ------------------------------------------------------------------ */

interface SentScreenProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  email: string;
  footerNote?: string;
  resendLabel: string;
  onResend: () => void;
  onBack: () => void;
  isLoading: boolean;
  cooldown: number;
  reduced: boolean;
  className?: string;
}

function SentScreen({
  icon,
  title,
  body,
  email,
  footerNote,
  resendLabel,
  onResend,
  onBack,
  isLoading,
  cooldown,
  reduced,
  className,
}: SentScreenProps) {
  return (
    <div className={cn('mx-auto w-full max-w-md', className)}>
      <motion.div
        {...motionProps(reduced, {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.3 },
        })}
        className="rounded-2xl border border-border bg-card p-8 text-center shadow-lg"
      >
        <motion.div
          {...motionProps(reduced, {
            initial: { scale: 0 },
            animate: { scale: 1 },
            transition: { type: 'spring', delay: 0.1 },
          })}
          className="mb-5 inline-flex"
        >
          {icon}
        </motion.div>

        <h1 className="mb-2 text-xl font-semibold text-foreground">{title}</h1>
        <p className="mb-4 text-sm text-muted-foreground">{body}</p>

        {email && (
          <p className="mb-6 inline-block rounded-lg bg-muted/50 px-4 py-2 text-sm font-medium text-foreground">
            {email}
          </p>
        )}

        <div className="space-y-3">
          <Button
            variant="outline"
            onClick={onResend}
            disabled={cooldown > 0 || isLoading}
            className="w-full"
            aria-label={
              cooldown > 0 ? `Resend available in ${cooldown} seconds` : `Resend ${resendLabel}`
            }
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {cooldown > 0 ? `Resend in ${cooldown}s` : `Resend ${resendLabel}`}
          </Button>

          <button
            type="button"
            onClick={onBack}
            className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
          </button>
        </div>

        {footerNote && (
          <div className="mt-7 border-t border-border/50 pt-5">
            <p className="text-xs text-muted-foreground">{footerNote}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main AuthForm                                                        */
/* ------------------------------------------------------------------ */

export function AuthForm({ onSuccess, defaultMode = 'signin', className }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const reduced = useReducedMotion();

  const { signIn, signUp, signInWithMagicLink, resetPassword, error } = useAuthStore(
    useShallow((s) => ({
      signIn: s.signIn,
      signUp: s.signUp,
      signInWithMagicLink: s.signInWithMagicLink,
      resetPassword: s.resetPassword,
      error: s.error,
    })),
  );

  const [isPending, startTransition] = useTransition();

  const [formState, submitAction, isSubmitting] = useActionState<AuthFormState, FormData>(
    async (_prevState, formData) => {
      const formEmail = formData.get('email') as string;
      const formPassword = formData.get('password') as string;
      const formName = formData.get('name') as string;
      const formConfirmPassword = formData.get('confirmPassword') as string;

      let result: { error: string | null };

      switch (mode) {
        case 'signin':
          result = await signIn(formEmail, formPassword);
          if (!result.error) {
            onSuccess?.();
            return { error: null, isHandoff: false, success: true };
          }
          return {
            error: result.error,
            isHandoff: isHandoffMessage(result.error),
            success: false,
          };

        case 'signup':
          if (formPassword.length < 6) {
            return {
              error: 'Password must be at least 6 characters',
              isHandoff: false,
              success: false,
            };
          }
          result = await signUp(formEmail, formPassword, formName || undefined);
          if (!result.error) {
            return {
              error: null,
              isHandoff: false,
              success: true,
              mode: 'email-verification-sent' as AuthMode,
            };
          }
          return {
            error: result.error,
            isHandoff: isHandoffMessage(result.error),
            success: false,
          };

        case 'magic-link':
          result = await signInWithMagicLink(formEmail);
          if (!result.error) {
            return {
              error: null,
              isHandoff: false,
              success: true,
              mode: 'magic-link-sent' as AuthMode,
            };
          }
          return {
            error: result.error,
            isHandoff: isHandoffMessage(result.error),
            success: false,
          };

        case 'reset-password':
          result = await resetPassword(formEmail);
          if (!result.error) {
            return {
              error: null,
              isHandoff: false,
              success: true,
              mode: 'reset-link-sent' as AuthMode,
            };
          }
          return {
            error: result.error,
            isHandoff: isHandoffMessage(result.error),
            success: false,
          };

        case 'set-new-password': {
          if (formPassword !== formConfirmPassword) {
            return { error: 'Passwords do not match', isHandoff: false, success: false };
          }
          if (formPassword.length < 6) {
            return {
              error: 'Password must be at least 6 characters',
              isHandoff: false,
              success: false,
            };
          }
          const { error: updateError } = await cloudAccountAuth.updatePassword(formPassword);
          if (updateError) {
            return { error: updateError.message, isHandoff: false, success: false };
          }
          onSuccess?.();
          return { error: null, isHandoff: false, success: true };
        }

        default:
          return { error: null, isHandoff: false, success: false };
      }
    },
    { error: null, isHandoff: false, success: false },
  );

  useEffect(() => {
    if (formState.mode) {
      setMode(formState.mode);
    }
  }, [formState.mode]);

  const isLoading = isSubmitting || isPending;

  useEffect(() => {
    const checkAuthCallback = async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      const accessToken = params.get('access_token');

      if (type === 'recovery' && accessToken) {
        setMode('set-new-password');
      } else if (type === 'signup' && accessToken) {
        onSuccess?.();
      }
    };

    checkAuthCallback();
  }, [onSuccess]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [resendCooldown]);

  const handleResendEmail = () => {
    if (resendCooldown > 0) return;

    startTransition(async () => {
      let result: { error: string | null };

      if (mode === 'email-verification-sent') {
        result = await signUp(email, password, name || undefined);
      } else if (mode === 'magic-link-sent') {
        result = await signInWithMagicLink(email);
      } else if (mode === 'reset-link-sent') {
        result = await resetPassword(email);
      } else {
        return;
      }

      if (!result.error) {
        setResendCooldown(60);
      }
    });
  };

  const handleModeSwitch = (next: AuthMode) => {
    setMode(next);
    setLocalError(null);
  };

  const getModeConfig = () => {
    switch (mode) {
      case 'signin':
        return {
          title: 'Welcome back',
          subtitle: 'Sign in to your AGI account',
          buttonText: 'Sign in',
          formId: 'auth-signin-form',
        };
      case 'signup':
        return {
          title: 'Create account',
          subtitle: 'Create your AGI account for Web & Mobile cloud',
          buttonText: 'Continue',
          formId: 'auth-signup-form',
        };
      case 'magic-link':
        return {
          title: 'Magic link',
          subtitle: "We'll open AGI web so you can sign in",
          buttonText: 'Send magic link',
          formId: 'auth-magic-form',
        };
      case 'reset-password':
        return {
          title: 'Reset password',
          subtitle: "We'll send a link to reset your password",
          buttonText: 'Send reset link',
          formId: 'auth-reset-form',
        };
      case 'set-new-password':
        return {
          title: 'Set new password',
          subtitle: 'Enter your new password below',
          buttonText: 'Update password',
          formId: 'auth-new-password-form',
        };
      default:
        return { title: '', subtitle: '', buttonText: '', formId: 'auth-form' };
    }
  };

  const config = getModeConfig();

  // Prioritise handoff detection: if the store error or localError is a handoff message,
  // render the HandoffBanner; otherwise render ErrorBanner.
  const rawError = formState.error || localError || error;
  const displayIsHandoff =
    formState.isHandoff || isHandoffMessage(localError) || isHandoffMessage(error ?? null);
  const displayError = displayIsHandoff ? null : rawError;

  /* ------------------------------------------------------------------ */
  /* "Sent" confirmation screens                                          */
  /* ------------------------------------------------------------------ */

  if (mode === 'email-verification-sent') {
    return (
      <SentScreen
        icon={
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500">
            <MailCheck className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
        }
        title="Check your email"
        body="We've sent a verification link to"
        email={email}
        resendLabel="verification email"
        onResend={handleResendEmail}
        onBack={() => handleModeSwitch('signin')}
        isLoading={isLoading}
        cooldown={resendCooldown}
        reduced={reduced}
        className={className}
        footerNote="Didn't receive the email? Check your spam folder or make sure the address is correct."
      />
    );
  }

  if (mode === 'magic-link-sent') {
    return (
      <SentScreen
        icon={
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background">
            <Mail className="h-7 w-7" aria-hidden="true" />
          </div>
        }
        title="Magic link sent"
        body="We've sent a sign-in link to"
        email={email}
        resendLabel="magic link"
        onResend={handleResendEmail}
        onBack={() => handleModeSwitch('signin')}
        isLoading={isLoading}
        cooldown={resendCooldown}
        reduced={reduced}
        className={className}
      />
    );
  }

  if (mode === 'reset-link-sent') {
    return (
      <SentScreen
        icon={
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-500">
            <KeyRound className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
        }
        title="Reset link sent"
        body="We've sent a password reset link to"
        email={email}
        resendLabel="reset link"
        onResend={handleResendEmail}
        onBack={() => handleModeSwitch('signin')}
        isLoading={isLoading}
        cooldown={resendCooldown}
        reduced={reduced}
        className={className}
        footerNote="The link expires in 1 hour."
      />
    );
  }

  /* ------------------------------------------------------------------ */
  /* Main form card                                                       */
  /* ------------------------------------------------------------------ */

  return (
    <div className={cn('mx-auto w-full max-w-md', className)}>
      <motion.div
        {...motionProps(reduced, {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.3 },
        })}
        className="rounded-2xl border border-border bg-card p-8 shadow-lg"
      >
        {/* Header */}
        <div className="mb-7 text-center">
          <motion.div
            {...motionProps(reduced, {
              initial: { scale: 0 },
              animate: { scale: 1 },
              transition: { type: 'spring', delay: 0.1 },
            })}
            className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background"
            aria-hidden="true"
          >
            {mode === 'set-new-password' ? (
              <ShieldCheck className="h-6 w-6" />
            ) : (
              <Sparkles className="h-6 w-6" />
            )}
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              {...motionProps(reduced, {
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, y: -8 },
                transition: { duration: 0.18 },
              })}
            >
              <h1 className="text-xl font-semibold text-foreground">{config.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{config.subtitle}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Form */}
        <form action={submitAction} id={config.formId} noValidate className="space-y-4">
          {/* Name field (signup only) */}
          <AnimatePresence mode="wait">
            {mode === 'signup' && (
              <motion.div
                key="name"
                {...motionProps(reduced, {
                  initial: { opacity: 0, height: 0 },
                  animate: { opacity: 1, height: 'auto' },
                  exit: { opacity: 0, height: 0 },
                  transition: { duration: 0.2 },
                })}
              >
                <Label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium">
                  Full name
                </Label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="signup-name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className="h-11 bg-background/50 pl-10"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email field */}
          {mode !== 'set-new-password' && (
            <div>
              <Label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium">
                Email address
              </Label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="auth-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="h-11 bg-background/50 pl-10"
                />
              </div>
            </div>
          )}

          {/* Password fields */}
          <AnimatePresence mode="wait">
            {(mode === 'signin' || mode === 'signup' || mode === 'set-new-password') && (
              <motion.div
                key="password"
                {...motionProps(reduced, {
                  initial: { opacity: 0, height: 0 },
                  animate: { opacity: 1, height: 'auto' },
                  exit: { opacity: 0, height: 0 },
                  transition: { duration: 0.2 },
                })}
              >
                <Label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium">
                  {mode === 'set-new-password' ? 'New password' : 'Password'}
                </Label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="auth-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={
                      mode === 'signin'
                        ? 'current-password'
                        : mode === 'set-new-password'
                          ? 'new-password'
                          : 'new-password'
                    }
                    required
                    minLength={6}
                    className="h-11 bg-background/50 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {(mode === 'signup' || mode === 'set-new-password') && (
                  <p className="mt-1 text-xs text-muted-foreground" id="password-hint">
                    Must be at least 6 characters
                  </p>
                )}
              </motion.div>
            )}

            {mode === 'set-new-password' && (
              <motion.div
                key="confirm-password"
                {...motionProps(reduced, {
                  initial: { opacity: 0, height: 0 },
                  animate: { opacity: 1, height: 'auto' },
                  exit: { opacity: 0, height: 0 },
                  transition: { duration: 0.2 },
                })}
              >
                <Label htmlFor="auth-confirm-password" className="mb-1.5 block text-sm font-medium">
                  Confirm new password
                </Label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="auth-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    className="h-11 bg-background/50 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirmation' : 'Show confirmation'}
                    aria-pressed={showConfirmPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline feedback banners */}
          <AnimatePresence>
            {displayIsHandoff && (
              <motion.div
                key="handoff"
                {...motionProps(reduced, {
                  initial: { opacity: 0, y: -8 },
                  animate: { opacity: 1, y: 0 },
                  exit: { opacity: 0, y: -8 },
                  transition: { duration: 0.2 },
                })}
              >
                <HandoffBanner email={email} />
              </motion.div>
            )}
            {displayError && !displayIsHandoff && (
              <motion.div
                key="error"
                {...motionProps(reduced, {
                  initial: { opacity: 0, y: -8 },
                  animate: { opacity: 1, y: 0 },
                  exit: { opacity: 0, y: -8 },
                  transition: { duration: 0.2 },
                })}
              >
                <ErrorBanner message={displayError} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Primary submit button */}
          <Button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            className="h-11 w-full border-0 bg-foreground text-background hover:bg-foreground/90"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <>
                {config.buttonText}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </form>

        {/* OAuth buttons (signin + signup only) */}
        {(mode === 'signin' || mode === 'signup') && (
          <div className="mt-5 space-y-3">
            <div className="relative" aria-hidden="true">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                aria-label="Continue with GitHub"
                onClick={async () => {
                  try {
                    const { signInWithOAuth } = useAuthStore.getState();
                    const result = await signInWithOAuth('github');
                    if (result.error) {
                      setLocalError(result.error);
                    }
                  } catch (err) {
                    setLocalError(err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                <GitHubIcon className="h-4 w-4" />
                GitHub
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                aria-label="Continue with Google"
                onClick={async () => {
                  try {
                    const { signInWithOAuth } = useAuthStore.getState();
                    const result = await signInWithOAuth('google');
                    if (result.error) {
                      setLocalError(result.error);
                    }
                  } catch (err) {
                    setLocalError(err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                <GoogleIcon className="h-4 w-4" />
                Google
              </Button>
            </div>
          </div>
        )}

        {/* Footer navigation links */}
        <div className="mt-5 space-y-3">
          {mode === 'signin' && (
            <>
              <div className="relative" aria-hidden="true">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => handleModeSwitch('magic-link')}
                className="w-full h-11"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Sign in with magic link
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('reset-password')}
                  className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('signup')}
                  className="rounded font-medium text-foreground underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Create account
                </button>
              </div>
            </>
          )}

          {mode === 'signup' && (
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => handleModeSwitch('signin')}
                className="rounded font-medium text-foreground underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Sign in
              </button>
            </p>
          )}

          {(mode === 'magic-link' || mode === 'reset-password') && (
            <button
              type="button"
              onClick={() => handleModeSwitch('signin')}
              className="mx-auto flex items-center justify-center gap-1.5 rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to sign in
            </button>
          )}

          {mode === 'set-new-password' && (
            <button
              type="button"
              onClick={() => {
                handleModeSwitch('signin');
                window.history.replaceState(null, '', window.location.pathname);
              }}
              className="mx-auto flex items-center justify-center gap-1.5 rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to sign in
            </button>
          )}

          <div className="border-t border-border/50 pt-3">
            <p className="text-center text-xs text-muted-foreground">
              Prefer the web?{' '}
              <a
                href="https://agiworkforce.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded text-foreground underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                Sign up on our website
              </a>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default AuthForm;
