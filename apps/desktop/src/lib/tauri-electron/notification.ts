import { getElectronHostBridge } from './bridgeContract';

export interface SendNotificationOptions {
  title: string;
  body?: string;
  /**
   * Where a click on this notification takes the user, as an
   * `agiworkforce-cloud://` URL. The shell hands it back on the deep-link
   * channel, so the page's deep-link router resolves it exactly like an
   * external open.
   */
  deepLink?: string;
}

export async function sendNotification(options: string | SendNotificationOptions): Promise<void> {
  const host = getElectronHostBridge();
  if (!host) return;
  const request = typeof options === 'string' ? { title: options } : options;
  await host.notify({
    title: request.title,
    ...(request.body !== undefined ? { body: request.body } : {}),
    ...(request.deepLink !== undefined ? { deepLink: request.deepLink } : {}),
  });
}
