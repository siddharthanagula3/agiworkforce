import * as Sentry from '@sentry/nextjs';

import { commonInitOptions, shouldInitializeSentry } from './lib/sentry-shared';

if (shouldInitializeSentry()) {
  Sentry.init(commonInitOptions());
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
