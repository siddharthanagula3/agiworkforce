import * as Sentry from '@sentry/nextjs';
import { initBotId } from 'botid/client/core';

import { BOT_CHALLENGED_ROUTES } from './lib/security/bot-challenge-routes';
import { BOT_PROTECTION_MODES, clientBotProtectionMode } from './lib/security/bot-protection';
import { commonInitOptions, shouldInitializeSentry } from './lib/sentry-shared';

if (clientBotProtectionMode() === BOT_PROTECTION_MODES.platform) {
  initBotId({ protect: BOT_CHALLENGED_ROUTES });
}

if (shouldInitializeSentry()) {
  Sentry.init(commonInitOptions());
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
