import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

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
            Session ID dict: {searchParams.session_id.slice(-8)}
          </p>
        )}

        <div className="flex flex-col gap-4 w-full pt-4">
          <Link
            href="agiworkforce://"
            className="inline-flex h-11 items-center justify-center rounded-md bg-white px-8 text-sm font-medium text-black transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700 disabled:pointer-events-none disabled:opacity-50"
          >
            Open Desktop App
          </Link>

          <Link
            href="/download"
            className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-800 bg-black px-8 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700 disabled:pointer-events-none disabled:opacity-50"
          >
            Download App
          </Link>
        </div>
      </div>
    </div>
  );
}
