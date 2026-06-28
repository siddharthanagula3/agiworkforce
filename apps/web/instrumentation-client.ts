/**
 * instrumentation-client.ts — browser-side Sentry init (Next.js 16 auto-loads
 * this on the client). OBSERVABILITY-WEB-SENTRY-01.
 *
 * Default-disabled: only initializes in production with a configured DSN. The
 * PII-safe options (sendDefaultPii: false + beforeSend scrub) live in
 * lib/sentry-shared so the browser, server, and edge inits stay identical.
 */
import * as Sentry from '@sentry/nextjs';

import { commonInitOptions, isSentryConfigured } from './lib/sentry-shared';

if (isSentryConfigured()) {
  Sentry.init(commonInitOptions());
}

// Instrument App Router client-side navigations (no-op when Sentry is disabled).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
