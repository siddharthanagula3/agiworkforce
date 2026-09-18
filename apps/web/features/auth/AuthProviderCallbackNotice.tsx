'use client';

import type { AuthNoticeKind } from '@/lib/auth/error-taxonomy';
import { AuthNoticeStep } from './AuthNoticeStep';

export function AuthProviderCallbackNotice({
  notice,
  retryHref,
}: {
  notice: AuthNoticeKind;
  retryHref: string;
}) {
  return <AuthNoticeStep notice={notice} retryAfterSeconds={null} restartHref={retryHref} />;
}
