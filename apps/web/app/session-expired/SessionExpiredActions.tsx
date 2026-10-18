'use client';

import { useSearchParams } from 'next/navigation';
import { Button, ButtonRow } from '@/features/marketing/components/system';

const SAFE_RETURN_PATH = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/;

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
      <Button href={`/login/complete?redirectTo=${encodeURIComponent(returnTo)}`}>
        Sign in again
      </Button>
    </ButtonRow>
  );
}
