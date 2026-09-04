import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

/**
 * What a recipient sees when a published-artifact link no longer resolves.
 *
 * Deliberately NOT the global 404. That page says "the page you're looking for
 * doesn't exist or has been moved", which is wrong here in a way that matters:
 * the artifact was revoked or expired by the person who shared it, nothing
 * moved, and the recipient did not mistype anything. It also blamed them for a
 * link someone else sent.
 *
 * This is the same situation /share/<token> already handles, shown to the same
 * audience, someone outside the organization, often seeing the product for the
 * first time, so it uses the same treatment rather than a second visual
 * language for one shared concept.
 */
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
