'use client';

import { useSearchParams } from 'next/navigation';
import { Button, ButtonRow } from '@/features/marketing/components/system';

const SAFE_RETURN_PATH = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/;

/**
 * `redirectTo` comes from whatever bounced the user here, so it is treated as
 * untrusted input: only a same-origin absolute path is ever handed to the
 * sign-in link, and anything else falls back to the app root. Without this an
 * attacker-supplied `redirectTo=https://evil.example` turns a session prompt
 * into an open redirect off the back of a real sign-in.
 */
function safeReturnPath(value: string | null): string {
  if (!value) return '/chat';
  if (!SAFE_RETURN_PATH.test(value)) return '/chat';
  return value;
}

export function SessionExpiredActions() {
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get('redirectTo'));

  return (
    <ButtonRow>
      <Button href={`/login?redirectTo=${encodeURIComponent(returnTo)}`}>Sign in again</Button>
    </ButtonRow>
  );
}
