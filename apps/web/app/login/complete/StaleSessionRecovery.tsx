'use client';

import { useEffect, useRef, useState } from 'react';
import { useClerk } from '@clerk/nextjs';

export function StaleSessionRecovery({
  loginUrl,
  alreadyRetried,
}: {
  loginUrl: string;
  alreadyRetried: boolean;
}) {
  const { signOut } = useClerk();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (alreadyRetried || started.current) return;
    started.current = true;

    void signOut({ redirectUrl: loginUrl }).catch(() => setFailed(true));
  }, [alreadyRetried, loginUrl, signOut]);

  const stuck = alreadyRetried || failed;

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-semibold text-foreground">
          {stuck ? 'We could not finish signing you in' : 'Finishing sign-in…'}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {stuck
            ? 'Your browser is holding a sign-in this server will not accept. Clearing it did not help, so something else is wrong: clearing cookies for this site and signing in again usually fixes it.'
            : 'Your previous session has expired. Clearing it and returning you to sign-in.'}
        </p>
        {stuck ? (
          <a
            href={loginUrl}
            className="inline-flex rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to sign-in
          </a>
        ) : null}
      </div>
    </main>
  );
}
