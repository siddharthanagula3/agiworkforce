'use client';

import * as Sentry from '@sentry/nextjs';
import { commonInitOptions, shouldInitializeSentry } from '@/lib/sentry-shared';

export function initializeSentryAfterConsent(): void {
  if (!shouldInitializeSentry()) return;
  Sentry.init(commonInitOptions());
}
