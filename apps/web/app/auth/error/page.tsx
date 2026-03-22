'use client';

import { Button } from '@/components/ui';
import { AlertTriangle, Bot, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  access_denied: {
    title: 'Access Denied',
    description: 'You have denied access to your account. Please try signing in again.',
  },
  server_error: {
    title: 'Server Error',
    description: 'An unexpected error occurred on our servers. Please try again later.',
  },
  temporarily_unavailable: {
    title: 'Service Temporarily Unavailable',
    description:
      'The authentication service is temporarily unavailable. Please try again in a few minutes.',
  },
  invalid_request: {
    title: 'Invalid Request',
    description: 'The authentication request was invalid. Please try signing in again.',
  },
  unauthorized_client: {
    title: 'Unauthorized',
    description: 'This application is not authorized to access your account.',
  },
  expired_link: {
    title: 'Link Expired',
    description: 'This authentication link has expired. Please request a new one.',
  },
  invalid_token: {
    title: 'Invalid Token',
    description: 'The authentication token is invalid or has expired. Please try signing in again.',
  },
  email_not_confirmed: {
    title: 'Email Not Confirmed',
    description: 'Please check your email and click the confirmation link before signing in.',
  },
  default: {
    title: 'Authentication Error',
    description: 'An error occurred during authentication. Please try again.',
  },
};

function AuthErrorContent() {
  const searchParams = useSearchParams();

  const errorInfo = useMemo(() => {
    const errorCode = searchParams.get('error') || 'default';
    const errorDescription = searchParams.get('error_description');

    const knownError = ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES['default']!;

    return {
      ...knownError,
      // Use error_description from URL if available
      description: errorDescription || knownError.description,
      code: errorCode,
    };
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
      <div className="w-full max-w-md space-y-8 text-center">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 font-bold text-2xl tracking-tighter mb-6"
        >
          <Bot className="h-8 w-8 text-blue-500" />
          <span>AGI Workforce</span>
        </Link>

        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>

        <div className="space-y-2">
          <h2 className="text-3xl font-bold">{errorInfo.title}</h2>
          <p className="text-zinc-400">{errorInfo.description}</p>
        </div>

        {errorInfo.code !== 'default' && (
          <p className="text-xs text-zinc-600">Error code: {errorInfo.code}</p>
        )}

        <div className="space-y-3 pt-4">
          <Link href="/login">
            <Button className="w-full h-12">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="w-full h-12">
              Back to Home
            </Button>
          </Link>
        </div>

        <div className="pt-6 border-t border-zinc-800">
          <p className="text-sm text-zinc-500">
            Need help?{' '}
            <a href="mailto:contact@agiworkforce.com" className="text-blue-400 hover:underline">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
