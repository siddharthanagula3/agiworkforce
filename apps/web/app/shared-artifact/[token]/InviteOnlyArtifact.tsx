import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { webSignInHref } from '@/features/marketing/components/system/nav';

export function InviteOnlyArtifact({ token, signedIn }: { token: string; signedIn: boolean }) {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md px-6 text-center" data-testid="invite-only-artifact">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h1 className="mb-2 text-h1 text-foreground">
          {signedIn ? 'You do not have access' : 'Sign in to open this'}
        </h1>
        <p className="mb-6 text-muted-foreground">
          {signedIn
            ? 'This was shared with specific people. Ask the person who shared it to invite the email address you signed in with.'
            : 'This was shared with specific people. Sign in with the email address it was shared with.'}
        </p>
        <Link
          href={signedIn ? '/' : webSignInHref(`/shared-artifact/${token}`)}
          className="inline-flex rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {signedIn ? 'Open AGI' : 'Sign in'}
        </Link>
      </div>
    </main>
  );
}
