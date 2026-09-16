export interface SendNotificationOptions {
  title: string;
  body?: string;
  deepLink?: string;
}

export async function sendNotification(
  _options?: string | SendNotificationOptions,
): Promise<void> {}
