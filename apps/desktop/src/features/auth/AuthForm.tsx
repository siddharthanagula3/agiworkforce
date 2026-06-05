import { useShallow } from 'zustand/react/shallow';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
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
import { cn } from '../../lib/utils';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { useAuthStore } from '../../stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

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

// Form state type for useActionState
interface AuthFormState {
  error: string | null;
  success: boolean;
  mode?: AuthMode;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
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
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.65.5.8 5.35.8 11.32c0 4.78 3.1 8.83 7.4 10.26.55.1.75-.23.75-.51 0-.25-.01-.93-.01-1.82-3.01.62-3.65-1.24-3.65-1.24-.49-1.18-1.2-1.49-1.2-1.49-.98-.64.07-.63.07-.63 1.08.07 1.65 1.07 1.65 1.07.96 1.58 2.52 1.12 3.14.86.1-.67.38-1.12.68-1.38-2.4-.26-4.93-1.15-4.93-5.12 0-1.13.42-2.06 1.1-2.79-.11-.26-.48-1.32.11-2.75 0 0 .9-.28 2.94 1.06.86-.23 1.77-.35 2.68-.35.91 0 1.82.12 2.68.35 2.04-1.34 2.94-1.06 2.94-1.06.59 1.43.22 2.49.11 2.75.68.73 1.1 1.66 1.1 2.79 0 3.98-2.54 4.85-4.96 5.11.39.32.73.96.73 1.94 0 1.4-.01 2.53-.01 2.87 0 .28.2.61.75.51 4.3-1.43 7.39-5.48 7.39-10.25C23.2 5.35 18.35.5 12 .5z" />
    </svg>
  );
}

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

  const { signIn, signUp, signInWithMagicLink, resetPassword, error } = useAuthStore(
    useShallow((s) => ({
      signIn: s.signIn,
      signUp: s.signUp,
      signInWithMagicLink: s.signInWithMagicLink,
      resetPassword: s.resetPassword,
      error: s.error,
    })),
  );

  // React 19: useTransition for async operations with pending state
  const [isPending, startTransition] = useTransition();

  // React 19: useActionState for form submission with built-in error handling
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
            return { error: null, success: true };
          }
          return { error: result.error, success: false };

        case 'signup':
          if (formPassword.length < 6) {
            return { error: 'Password must be at least 6 characters', success: false };
          }
          result = await signUp(formEmail, formPassword, formName || undefined);
          if (!result.error) {
            return { error: null, success: true, mode: 'email-verification-sent' as AuthMode };
          }
          return { error: result.error, success: false };

        case 'magic-link':
          result = await signInWithMagicLink(formEmail);
          if (!result.error) {
            return { error: null, success: true, mode: 'magic-link-sent' as AuthMode };
          }
          return { error: result.error, success: false };

        case 'reset-password':
          result = await resetPassword(formEmail);
          if (!result.error) {
            return { error: null, success: true, mode: 'reset-link-sent' as AuthMode };
          }
          return { error: result.error, success: false };

        case 'set-new-password': {
          if (formPassword !== formConfirmPassword) {
            return { error: 'Passwords do not match', success: false };
          }
          if (formPassword.length < 6) {
            return { error: 'Password must be at least 6 characters', success: false };
          }
          const { error: updateError } = await cloudAccountAuth.updatePassword(formPassword);
          if (updateError) {
            return { error: updateError.message, success: false };
          }
          onSuccess?.();
          return { error: null, success: true };
        }

        default:
          return { error: null, success: false };
      }
    },
    { error: null, success: false },
  );

  // Handle mode changes from form action results
  useEffect(() => {
    if (formState.mode) {
      setMode(formState.mode);
    }
  }, [formState.mode]);

  // Combined loading state: either from form submission or from store
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

  // React 19: Use startTransition for resend email action
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

  const getModeConfig = () => {
    switch (mode) {
      case 'signin':
        return {
          title: 'Welcome back',
          subtitle: 'Sign in to your AGI account',
          buttonText: 'Sign in',
        };
      case 'signup':
        return {
          title: 'Create account',
          subtitle: 'Start your AI automation journey',
          buttonText: 'Create account',
        };
      case 'magic-link':
        return {
          title: 'Magic link',
          subtitle: "We'll email you a magic link to sign in",
          buttonText: 'Send magic link',
        };
      case 'reset-password':
        return {
          title: 'Reset password',
          subtitle: "We'll send you a link to reset your password",
          buttonText: 'Send reset link',
        };
      case 'set-new-password':
        return {
          title: 'Set new password',
          subtitle: 'Enter your new password below',
          buttonText: 'Update password',
        };
      default:
        return {
          title: '',
          subtitle: '',
          buttonText: '',
        };
    }
  };

  const config = getModeConfig();
  // React 19: Error comes from form state, local state, or store
  const displayError = formState.error || localError || error;

  if (mode === 'email-verification-sent') {
    return (
      <div className={cn('w-full max-w-md mx-auto', className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl border border-border bg-card p-8 text-center shadow-xl"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500"
          >
            <MailCheck className="w-10 h-10 text-white" />
          </motion.div>

          <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
          <p className="text-muted-foreground mb-6">We've sent a verification link to</p>
          <p className="text-foreground font-medium bg-muted/50 rounded-lg py-2 px-4 mb-6 inline-block">
            {email}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Click the link in the email to verify your account and get started with AGI.
          </p>

          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={handleResendEmail}
              disabled={resendCooldown > 0 || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
            </Button>

            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setLocalError(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 w-full"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Didn't receive the email? Check your spam folder or make sure your email address is
              correct.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (mode === 'magic-link-sent') {
    return (
      <div className={cn('w-full max-w-md mx-auto', className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl border border-border bg-card p-8 text-center shadow-xl"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-foreground text-background"
          >
            <Mail className="h-8 w-8" />
          </motion.div>

          <h1 className="text-2xl font-bold text-foreground mb-2">Magic link sent!</h1>
          <p className="text-muted-foreground mb-6">We've sent a sign-in link to</p>
          <p className="text-foreground font-medium bg-muted/50 rounded-lg py-2 px-4 mb-6 inline-block">
            {email}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Click the link in the email to sign in instantly — no password needed.
          </p>

          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={handleResendEmail}
              disabled={resendCooldown > 0 || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend magic link'}
            </Button>

            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setLocalError(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 w-full"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (mode === 'reset-link-sent') {
    return (
      <div className={cn('w-full max-w-md mx-auto', className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl border border-border bg-card p-8 text-center shadow-xl"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-500"
          >
            <KeyRound className="w-10 h-10 text-white" />
          </motion.div>

          <h1 className="text-2xl font-bold text-foreground mb-2">Reset link sent!</h1>
          <p className="text-muted-foreground mb-6">We've sent a password reset link to</p>
          <p className="text-foreground font-medium bg-muted/50 rounded-lg py-2 px-4 mb-6 inline-block">
            {email}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Click the link in the email to reset your password. The link will expire in 1 hour.
          </p>

          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={handleResendEmail}
              disabled={resendCooldown > 0 || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend reset link'}
            </Button>

            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setLocalError(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 w-full"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn('w-full max-w-md mx-auto', className)}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl border border-border bg-card p-8 shadow-xl"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background"
          >
            {mode === 'set-new-password' ? (
              <ShieldCheck className="h-7 w-7" />
            ) : (
              <Sparkles className="h-7 w-7" />
            )}
          </motion.div>
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <h1 className="text-2xl font-bold text-foreground">{config.title}</h1>
              <p className="text-muted-foreground mt-1">{config.subtitle}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <form action={submitAction} className="space-y-4">
          <AnimatePresence mode="wait">
            {mode === 'signup' && (
              <motion.div
                key="name"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Label htmlFor="name" className="text-sm font-medium">
                  Full name
                </Label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="pl-10 h-11 bg-background/50"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {mode !== 'set-new-password' && (
            <div>
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="pl-10 h-11 bg-background/50"
                />
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {(mode === 'signin' || mode === 'signup' || mode === 'set-new-password') && (
              <motion.div
                key="password"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Label htmlFor="password" className="text-sm font-medium">
                  {mode === 'set-new-password' ? 'New password' : 'Password'}
                </Label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="pl-10 pr-10 h-11 bg-background/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {(mode === 'signup' || mode === 'set-new-password') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Must be at least 6 characters
                  </p>
                )}
              </motion.div>
            )}

            {mode === 'set-new-password' && (
              <motion.div
                key="confirm-password"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm new password
                </Label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="pl-10 pr-10 h-11 bg-background/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {displayError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                {displayError}
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            type="submit"
            disabled={isLoading}
            className="h-11 w-full border-0 bg-foreground text-background hover:bg-foreground/90"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {config.buttonText}
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </form>

        {(mode === 'signin' || mode === 'signup') && (
          <div className="mt-6 space-y-3">
            <div className="relative">
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
                onClick={async () => {
                  try {
                    const { signInWithOAuth } = useAuthStore.getState();
                    const result = await signInWithOAuth('github');
                    if (result.error) {
                      setLocalError(result.error);
                    }
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setLocalError(msg);
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
                onClick={async () => {
                  try {
                    const { signInWithOAuth } = useAuthStore.getState();
                    const result = await signInWithOAuth('google');
                    if (result.error) {
                      setLocalError(result.error);
                    }
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setLocalError(msg);
                  }
                }}
              >
                <GoogleIcon className="h-4 w-4" />
                Google
              </Button>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {mode === 'signin' && (
            <>
              <div className="relative">
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
                onClick={() => {
                  setMode('magic-link');
                  setLocalError(null);
                }}
                className="w-full h-11"
              >
                <Mail className="w-4 h-4 mr-2" />
                Sign in with magic link
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset-password');
                    setLocalError(null);
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setLocalError(null);
                  }}
                  className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
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
                onClick={() => {
                  setMode('signin');
                  setLocalError(null);
                }}
                className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
              >
                Sign in
              </button>
            </p>
          )}

          <div className="pt-2 border-t border-border/50">
            <p className="text-center text-xs text-muted-foreground">
              Prefer the web?{' '}
              <a
                href="https://app.agiworkforce.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline-offset-4 transition-colors hover:underline"
              >
                Sign up on our website
              </a>
            </p>
          </div>

          {(mode === 'magic-link' || mode === 'reset-password') && (
            <p className="text-center text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setLocalError(null);
                }}
                className="mx-auto flex items-center justify-center gap-1 font-medium text-foreground underline-offset-4 transition-colors hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </button>
            </p>
          )}

          {mode === 'set-new-password' && (
            <p className="text-center text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setLocalError(null);

                  window.history.replaceState(null, '', window.location.pathname);
                }}
                className="mx-auto flex items-center justify-center gap-1 font-medium text-foreground underline-offset-4 transition-colors hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </button>
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default AuthForm;
