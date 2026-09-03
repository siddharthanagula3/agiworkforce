import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

export function UnavailableArtifact() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md px-6 text-center">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Shared artifact unavailable</h1>
        <p className="mb-6 text-muted-foreground">
          This link may have expired, been unpublished, or been entered incorrectly. Ask the sender
          for a new link.
        </p>
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
