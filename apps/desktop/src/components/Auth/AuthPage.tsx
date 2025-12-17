/**
 * AuthPage Component
 *
 * Full-page authentication view with a beautiful split layout.
 * Features a decorative side panel with product highlights.
 * Handles all auth flows including email verification and password reset.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Zap, Shield, Bot, CheckCircle2, Loader2 } from 'lucide-react';
import { AuthForm } from './AuthForm';
import { supabaseAuth } from '../../services/supabaseAuth';
import { Button } from '../ui/Button';

interface AuthPageProps {
  onAuthSuccess?: () => void;
}

type PageState = 'auth' | 'verifying' | 'verified' | 'error';

const features = [
  {
    icon: Bot,
    title: 'AI-Powered Automation',
    description: 'Let AI agents handle repetitive tasks while you focus on what matters.',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Execute workflows in seconds with our optimized automation engine.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Your data stays private with local processing and encrypted storage.',
  },
];

export function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [pageState, setPageState] = useState<PageState>('auth');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle auth callbacks from email links
  useEffect(() => {
    const handleAuthCallback = async () => {
      const hash = window.location.hash;
      if (!hash) return;

      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      const accessToken = params.get('access_token');
      const errorDescription = params.get('error_description');

      // Handle errors
      if (errorDescription) {
        setErrorMessage(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
        setPageState('error');
        return;
      }

      // Handle email verification
      if (type === 'signup' && accessToken) {
        setPageState('verifying');

        // The session should already be set by Supabase
        // Give it a moment to process
        setTimeout(() => {
          const isAuth = supabaseAuth.isAuthenticated();
          if (isAuth) {
            setPageState('verified');
            // Clear the hash from URL
            window.history.replaceState(null, '', window.location.pathname);
            // Auto redirect after showing success
            setTimeout(() => {
              onAuthSuccess?.();
            }, 2000);
          } else {
            setPageState('auth');
          }
        }, 1000);
        return;
      }

      // Handle magic link
      if (type === 'magiclink' && accessToken) {
        setPageState('verifying');
        setTimeout(() => {
          const isAuth = supabaseAuth.isAuthenticated();
          if (isAuth) {
            window.history.replaceState(null, '', window.location.pathname);
            onAuthSuccess?.();
          } else {
            setPageState('auth');
          }
        }, 1000);
        return;
      }

      // Password recovery is handled by AuthForm
    };

    handleAuthCallback();
  }, [onAuthSuccess]);

  // Email verified success screen
  if (pageState === 'verified') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 mb-6"
          >
            <CheckCircle2 className="w-12 h-12 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground mb-4">Email Verified!</h1>
          <p className="text-muted-foreground mb-6">
            Your account has been verified successfully. You'll be redirected to AGI Workforce
            shortly.
          </p>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Redirecting...</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // Verifying screen
  if (pageState === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <Loader2 className="w-12 h-12 text-violet-500 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying your account...</p>
        </motion.div>
      </div>
    );
  }

  // Error screen
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-6">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Something went wrong</h1>
          <p className="text-muted-foreground mb-6">
            {errorMessage || 'An error occurred during authentication.'}
          </p>
          <Button
            onClick={() => {
              setPageState('auth');
              setErrorMessage(null);
              window.history.replaceState(null, '', window.location.pathname);
            }}
            className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white border-0"
          >
            Try again
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600" />

        {/* Animated background elements */}
        <div className="absolute inset-0">
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute top-20 left-20 w-96 h-96 bg-white/10 rounded-full blur-3xl"
          />
          <motion.div
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute bottom-20 right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"
          />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center p-12 text-white">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-3 mb-12"
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold">AGI Workforce</span>
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-12"
          >
            <h1 className="text-4xl font-bold mb-4 leading-tight">
              Automate your work
              <br />
              with AI agents
            </h1>
            <p className="text-lg text-white/80 max-w-md">
              Transform how you work with intelligent automation. Create, deploy, and manage AI
              agents that work for you 24/7.
            </p>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-6"
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-sm text-white/70">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Bottom CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mt-12 pt-8 border-t border-white/20"
          >
            <p className="text-sm text-white/60 mb-3">Trusted by thousands of professionals</p>
            <div className="flex items-center gap-4">
              {/* Placeholder for company logos or testimonials */}
              <div className="flex -space-x-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/30"
                  />
                ))}
              </div>
              <span className="text-sm text-white/80">
                Join 10,000+ users automating their work
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8 relative">
        {/* Mobile header */}
        <div className="lg:hidden absolute top-6 left-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground">AGI Workforce</span>
          </div>
        </div>

        <AuthForm onSuccess={onAuthSuccess} className="w-full" />
      </div>
    </div>
  );
}

export default AuthPage;
