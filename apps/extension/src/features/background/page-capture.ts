export interface PageCaptureDelivery {
  send: () => Promise<{ success?: boolean; error?: string } | undefined>;
  readActionCount: () => Promise<number>;
  writeActionCount: (count: number) => Promise<void>;
  notify: (title: string, message: string) => void;
  sent: { title: string; message: string };
}

export const PAGE_CAPTURE_UNDELIVERED_TITLE = 'Page capture not sent';

/**
 * Shown instead of capturing when AGI Desktop is not paired. The capture has
 * exactly one destination, the native messaging host, so photographing the
 * user's screen first and discarding the bytes afterwards buys nothing.
 */
export const PAGE_CAPTURE_UNAVAILABLE_MESSAGE =
  'Page capture needs AGI Desktop. Install and pair it from the extension options, ' +
  'then try the shortcut again. Nothing was captured.';

export const PAGE_CAPTURE_SITE_NOT_APPROVED_MESSAGE =
  'Page capture works only on sites you approved with browser control in the extension options.';

export const PAGE_CAPTURE_TAB_CHANGED_MESSAGE =
  'The tab changed before the page was captured, so nothing was sent. Try the shortcut again.';

export interface PageCaptureSource {
  id: number;
  windowId: number;
  url?: string;
}

export interface PageCaptureTabAccess {
  visibleTab: (windowId: number) => Promise<{ id?: number; url?: string } | undefined>;
  capture: (windowId: number) => Promise<string>;
}

export async function captureAdmittedTab(
  source: PageCaptureSource,
  access: PageCaptureTabAccess,
): Promise<string | null> {
  const stillShowing = async (): Promise<boolean> => {
    const visible = await access.visibleTab(source.windowId);
    return visible?.id === source.id && visible.url === source.url;
  };
  if (!(await stillShowing())) return null;
  const dataUrl = await access.capture(source.windowId);
  return (await stillShowing()) ? dataUrl : null;
}

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
  delivery.notify(delivery.sent.title, delivery.sent.message);
  return true;
}
