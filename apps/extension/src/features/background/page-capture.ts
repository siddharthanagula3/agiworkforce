export interface PageCaptureDelivery {
  send: () => Promise<{ success?: boolean; error?: string } | undefined>;
  readActionCount: () => Promise<number>;
  writeActionCount: (count: number) => Promise<void>;
  notify: (title: string, message: string) => void;
}

export const PAGE_CAPTURE_UNDELIVERED_TITLE = 'Page capture not sent';

export const PAGE_CAPTURE_UNAVAILABLE_MESSAGE =
  'Page capture needs AGI Desktop. Install and pair it from the extension options, ' +
  'then try the shortcut again. Nothing was captured.';

export function pageCaptureFailureMessage(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed || /native host/i.test(trimmed)) {
    return 'AGI Desktop is not connected, so the captured page went nowhere.';
  }
  return `The captured page could not reach AGI Desktop: ${trimmed.slice(0, 160)}`;
}

export async function deliverPageCapture(delivery: PageCaptureDelivery): Promise<boolean> {
  let response: { success?: boolean; error?: string } | undefined;
  try {
    response = await delivery.send();
  } catch (error) {
    delivery.notify(
      PAGE_CAPTURE_UNDELIVERED_TITLE,
      pageCaptureFailureMessage(error instanceof Error ? error.message : ''),
    );
    return false;
  }
  if (!response?.success) {
    delivery.notify(
      PAGE_CAPTURE_UNDELIVERED_TITLE,
      pageCaptureFailureMessage(response?.error ?? ''),
    );
    return false;
  }
  const current = await delivery.readActionCount();
  await delivery.writeActionCount(current + 1);
  return true;
}
