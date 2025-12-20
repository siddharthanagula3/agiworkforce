/**
 * AuthForm Component
 *
 * A beautiful, modern authentication form with support for:
 * - Email/password sign in
 * - Email/password sign up with email verification flow
 * - Magic link (passwordless) sign in
 * - Password reset with new password entry
 */

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
import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { supabaseAuth } from '../../services/supabaseAuth';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

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

  const { signIn, signUp, signInWithMagicLink, resetPassword, isLoading, error } = useAuthStore();

  // Check URL for auth callback (password reset, email verification)
  useEffect(() => {
    const checkAuthCallback = async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      const accessToken = params.get('access_token');

      if (type === 'recovery' && accessToken) {
        // User clicked password reset link
        setMode('set-new-password');
      } else if (type === 'signup' && accessToken) {
        // User clicked email verification link - they're now verified
        onSuccess?.();
      }
    };

    checkAuthCallback();
  }, [onSuccess]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    let result: { error: string | null };

    switch (mode) {
      case 'signin':
        result = await signIn(email, password);
        if (!result.error) {
          onSuccess?.();
        }
        break;

      case 'signup':
        if (password.length < 6) {
          setLocalError('Password must be at least 6 characters');
          return;
        }
        result = await signUp(email, password, name || undefined);
        if (!result.error) {
          setMode('email-verification-sent');
        }
        break;

      case 'magic-link':
        result = await signInWithMagicLink(email);
        if (!result.error) {
          setMode('magic-link-sent');
        }
        break;

      case 'reset-password':
        result = await resetPassword(email);
        if (!result.error) {
          setMode('reset-link-sent');
        }
        break;

      case 'set-new-password': {
        if (password !== confirmPassword) {
          setLocalError('Passwords do not match');
          return;
        }
        if (password.length < 6) {
          setLocalError('Password must be at least 6 characters');
          return;
        }
        const { error: updateError } = await supabaseAuth.updatePassword(password);
        if (updateError) {
          setLocalError(updateError.message);
        } else {
          onSuccess?.();
        }
        break;
      }
    }
  };

  const handleResendEmail = async () => {
    if (resendCooldown > 0) return;

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
  };

  const getModeConfig = () => {
    switch (mode) {
      case 'signin':
        return {
          title: 'Welcome back',
          subtitle: 'Sign in to your AGI Workforce account',
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
  const displayError = localError || error;

  // Email verification sent screen
  if (mode === 'email-verification-sent') {
    return (
      <div className={cn('w-full max-w-md mx-auto', className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 mb-6"
          >
            <MailCheck className="w-10 h-10 text-white" />
          </motion.div>

          <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
          <p className="text-muted-foreground mb-6">We've sent a verification link to</p>
          <p className="text-foreground font-medium bg-muted/50 rounded-lg py-2 px-4 mb-6 inline-block">
            {email}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Click the link in the email to verify your account and get started with AGI Workforce.
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

  // Magic link sent screen
  if (mode === 'magic-link-sent') {
    return (
      <div className={cn('w-full max-w-md mx-auto', className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 mb-6"
          >
            <Mail className="w-10 h-10 text-white" />
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

  // Reset link sent screen
  if (mode === 'reset-link-sent') {
    return (
      <div className={cn('w-full max-w-md mx-auto', className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 mb-6"
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
      {/* Decorative gradient background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 mb-4"
          >
            {mode === 'set-new-password' ? (
              <ShieldCheck className="w-8 h-8 text-white" />
            ) : (
              <Sparkles className="w-8 h-8 text-white" />
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {/* Name field - only for signup */}
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

          {/* Email field - not for set-new-password */}
          {mode !== 'set-new-password' && (
            <div>
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
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
            {/* Password field - for signin, signup, and set-new-password */}
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

            {/* Confirm password - for set-new-password */}
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

          {/* Error message */}
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

          {/* Submit button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white border-0"
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

        {/* Mode switchers */}
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
                  className="text-violet-500 hover:text-violet-400 font-medium transition-colors"
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
                className="text-violet-500 hover:text-violet-400 font-medium transition-colors"
              >
                Sign in
              </button>
            </p>
          )}

          <div className="pt-2 border-t border-border/50">
            <p className="text-center text-xs text-muted-foreground">
              Prefer the web?{' '}
              <a
                href="https://agiworkforce.com/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-500 hover:text-violet-400 transition-colors"
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
                className="text-violet-500 hover:text-violet-400 font-medium transition-colors flex items-center justify-center gap-1 mx-auto"
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
                  // Clear the URL hash
                  window.history.replaceState(null, '', window.location.pathname);
                }}
                className="text-violet-500 hover:text-violet-400 font-medium transition-colors flex items-center justify-center gap-1 mx-auto"
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
