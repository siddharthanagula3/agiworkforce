'use client';

import { getHostBridge } from '@agiworkforce/local-runtime-contract';
import { conversationDeepLink } from './deep-links';

export interface DesktopJobNotification {
  title: string;
  body?: string;
  conversationId?: string;
}

/**
 * Raises a desktop notification for work that finished while the user was
 * looking at something else.
 *
 * Silent in a browser, and silent while the page is visible: a result the user
 * is already watching arrive does not warrant a system notification.
 */
export async function notifyJobComplete(job: DesktopJobNotification): Promise<void> {
  const host = getHostBridge();
  if (!host) return;
  if (typeof document !== 'undefined' && !document.hidden) return;

  const deepLink = job.conversationId ? conversationDeepLink(job.conversationId) : undefined;
  await host.notify({
    title: job.title,
    ...(job.body ? { body: job.body } : {}),
    ...(deepLink ? { deepLink } : {}),
  });
}
