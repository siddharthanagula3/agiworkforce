'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { XCircle, ArrowLeft, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui';

function PaymentFailureContent() {
  const searchParams = useSearchParams();
  const error = searchParams?.get('error');
  const sessionId = searchParams?.get('session_id');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center text-center space-y-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/50">
          <XCircle className="h-10 w-10 text-red-500" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Payment Failed</h1>

        <p className="text-lg text-zinc-400">
          {error
            ? `Payment could not be processed: ${error}`
            : 'We were unable to process your payment. Please try again or contact support if the problem persists.'}
        </p>

        {sessionId && (
          <p className="text-sm text-zinc-600 font-mono">Session ID: {sessionId.slice(-8)}</p>
        )}

        <div className="flex flex-col gap-3 w-full pt-4">
          <Link href="/pricing" className="w-full">
            <Button className="w-full h-11 bg-white text-black hover:bg-zinc-200 font-medium">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Return to Pricing
            </Button>
          </Link>

          <Link href="/dashboard/billing" className="w-full">
            <Button
              variant="outline"
              className="w-full h-11 border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Manage Billing
            </Button>
          </Link>

          <div className="pt-4 border-t border-zinc-900/50 w-full mt-2">
            <p className="text-xs text-zinc-600 mb-2">Need help?</p>
            <Link
              href="mailto:support@agiworkforce.com"
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentFailurePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
          <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center text-center space-y-6">
            <p className="text-lg text-zinc-400">Loading...</p>
          </div>
        </div>
      }
    >
      <PaymentFailureContent />
    </Suspense>
  );
}
