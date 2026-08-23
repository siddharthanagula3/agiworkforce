import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

export function ExpiredShareBanner({ reason = 'expired' }: { reason?: 'expired' | 'unavailable' }) {
  const unavailable = reason === 'unavailable';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md px-6 text-center">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          {unavailable ? 'Shared conversation unavailable' : 'Shared conversation expired'}
        </h1>
        <p className="mb-6 text-muted-foreground">
          {unavailable
            ? 'This link may have expired, been revoked, or been entered incorrectly. Ask the sender for a new link.'
            : 'This read-only snapshot has reached its expiration date. Ask the sender to create a new link.'}
        </p>
        {/*
         * Design-system tokens, not a literal colour. This is the first thing a
         * recipient outside the organization ever sees of the product, and a
         * hardcoded blue here read as a different application than the one the
         * link came from. The AP-02 guard does not catch it because it scans for
         * hex literals rather than Tailwind palette classes.
         */}
        <Link
          href="/"
          className="inline-flex rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Open AGI
        </Link>
      </div>
    </div>
  );
}
