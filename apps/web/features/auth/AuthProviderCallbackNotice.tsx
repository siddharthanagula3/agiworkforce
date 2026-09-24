'use client';

import { useEffect } from 'react';

import { clearTermsGateMarker } from '@/app/signup/TermsGate';
import type { AuthNoticeKind } from '@/lib/auth/error-taxonomy';
import { AuthNoticeStep } from './AuthNoticeStep';

export function AuthProviderCallbackNotice({
  notice,
  retryHref,
}: {
  notice: AuthNoticeKind;
  retryHref: string;
}) {
  useEffect(() => {
    clearTermsGateMarker();
  }, []);

  return <AuthNoticeStep notice={notice} retryAfterSeconds={null} restartHref={retryHref} />;
}
