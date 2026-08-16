import * as Sentry from '@sentry/nextjs';

import { commonInitOptions, hasTelemetryConsent, isSentryConfigured } from './lib/sentry-shared';

if (isSentryConfigured() && hasTelemetryConsent()) {
  Sentry.init(commonInitOptions());
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
