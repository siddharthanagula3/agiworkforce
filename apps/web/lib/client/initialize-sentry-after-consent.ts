'use client';

import * as Sentry from '@sentry/nextjs';
import { shouldInitializeSentry } from '@/lib/sentry-shared';
import { clientSentryInitOptions } from './sentry-client-options';

export function initializeSentryAfterConsent(): void {
  if (!shouldInitializeSentry()) return;
  Sentry.init(clientSentryInitOptions());
}
