import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

export function ExpiredShareBanner({ reason = 'expired' }: { reason?: 'expired' | 'unavailable' }) {
  const unavailable = reason === 'unavailable';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="max-w-md px-6 text-center">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-gray-300"
          aria-hidden="true"
        >
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-white">
          {unavailable ? 'Shared conversation unavailable' : 'Shared conversation expired'}
        </h1>
        <p className="mb-6 text-gray-400">
          {unavailable
            ? 'This link may have expired, been revoked, or been entered incorrectly. Ask the sender for a new link.'
            : 'This read-only snapshot has reached its expiration date. Ask the sender to create a new link.'}
        </p>
        <Link
          href="/"
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-500"
        >
          Open AGI
        </Link>
      </div>
    </div>
  );
}
