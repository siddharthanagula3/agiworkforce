import * as Sentry from '@sentry/nextjs';
import { initBotId } from 'botid/client/core';

import { BOT_CHALLENGED_ROUTES } from './lib/security/bot-challenge-routes';
import { commonInitOptions, shouldInitializeSentry } from './lib/sentry-shared';

initBotId({ protect: BOT_CHALLENGED_ROUTES });

if (shouldInitializeSentry()) {
  Sentry.init(commonInitOptions());
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
