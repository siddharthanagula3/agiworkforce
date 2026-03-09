'use client';

/**
 * SignInToDesktop — generates an encrypted auth token and opens the desktop
 * app via the `agiworkforce://auth?token=...` deep link.
 *
 * Renders as a button that:
 * 1. Calls POST /api/auth/desktop-token to get an encrypted token
 * 2. Opens the deep link URL to transfer the session to the desktop app
 * 3. Shows loading/success/error states
 */

import React, { useState, useCallback } from 'react';
import { Monitor } from 'lucide-react';
import { Button } from '@/components/ui';

interface SignInToDesktopProps {
  /** Optional class name for the container. */
  className?: string;
  /** Render as compact inline button vs full card. */
  variant?: 'button' | 'card';
}

export const SignInToDesktop: React.FC<SignInToDesktopProps> = ({
  className = '',
  variant = 'button',
}) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSignInToDesktop = useCallback(async () => {
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/desktop-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // send cookies for session auth
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        deepLink: string;
        token: string;
        expiresAt: number;
      };

      // Open the deep link to transfer session to desktop
      window.location.href = data.deepLink;

      setStatus('success');

      // Reset after 5 seconds
      setTimeout(() => setStatus('idle'), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate token';
      setErrorMessage(message);
      setStatus('error');

      // Reset after 5 seconds
      setTimeout(() => {
        setStatus('idle');
        setErrorMessage('');
      }, 5000);
    }
  }, []);

  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={() => void handleSignInToDesktop()}
        disabled={status === 'loading'}
        className={
          'group relative flex w-full items-start gap-4 overflow-hidden rounded-xl ' +
          'border border-white/[0.06] bg-white/[0.03] p-5 text-left backdrop-blur-xl ' +
          'transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.05] ' +
          'disabled:opacity-50 disabled:cursor-not-allowed ' +
          className
        }
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
          <Monitor className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-white/90 group-hover:text-white">
            {status === 'loading'
              ? 'Generating token...'
              : status === 'success'
                ? 'Opening Desktop App...'
                : status === 'error'
                  ? 'Failed'
                  : 'Sign in to Desktop'}
          </div>
          <div className="mt-0.5 text-sm text-white/40 group-hover:text-white/50">
            {status === 'error' ? errorMessage : 'Transfer your session to the desktop app'}
          </div>
        </div>
      </button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void handleSignInToDesktop()}
      disabled={status === 'loading'}
      className={className}
    >
      <Monitor className="mr-2 h-4 w-4" />
      {status === 'loading'
        ? 'Generating...'
        : status === 'success'
          ? 'Opening Desktop...'
          : status === 'error'
            ? 'Failed'
            : 'Sign in to Desktop'}
    </Button>
  );
};
