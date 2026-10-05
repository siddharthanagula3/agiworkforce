'use client';

import { useEffect } from 'react';

import { clearSignupAttemptMarkers } from '@/app/signup/signupAttemptMarkers';
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
    clearSignupAttemptMarkers();
  }, []);

  return <AuthNoticeStep notice={notice} retryAfterSeconds={null} restartHref={retryHref} />;
}
