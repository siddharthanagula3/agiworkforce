import Link from 'next/link';
import { CheckCircle, LayoutDashboard, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui';

export default function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center text-center space-y-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/50">
          <CheckCircle className="h-10 w-10 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Payment Successful!</h1>

        <p className="text-lg text-zinc-400">
          Thank you for subscribing to AGI Workforce. Your account has been upgraded.
        </p>

        {searchParams.session_id && (
          <p className="text-sm text-zinc-600 font-mono">
            Session ID: {searchParams.session_id.slice(-8)}
          </p>
        )}

        <div className="flex flex-col gap-3 w-full pt-4">
          <Link href="/dashboard" className="w-full">
            <Button className="w-full h-11 bg-white text-black hover:bg-zinc-200 font-medium">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Go to Dashboard
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
            <Link
              href="agiworkforce://open"
              className="w-full inline-flex h-9 items-center justify-center text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
              target="_blank"
            >
              Open Desktop App
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
