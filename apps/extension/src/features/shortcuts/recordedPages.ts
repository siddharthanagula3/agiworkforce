import type { ExtensionResponse, RunPageActionsMessage } from '../../types';

export async function recordedPageKey(url: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function replayRecordedPages(
  message: RunPageActionsMessage,
  currentUrl: () => Promise<string | undefined>,
  approved: (url: string) => Promise<boolean>,
  dispatch: (message: RunPageActionsMessage) => Promise<ExtensionResponse>,
  assertCurrent: () => void,
): Promise<ExtensionResponse> {
  let performed = 0;
  for (const [index, action] of message.actions.entries()) {
    const origin = action.recordedOrigin;
    const key = action.recordedPage;
    if (!origin || !key) return { success: false, error: 'Incomplete recorded page identity.' };
    const deadline = Date.now() + (index ? 8_000 : 0);
    let matched = false;
    do {
      assertCurrent();
      const url = await currentUrl();
      if (url && new URL(url).origin === origin && (await recordedPageKey(url)) === key) {
        if (!(await approved(url)))
          return { success: false, error: 'Site access was withdrawn during replay.' };
        matched = true;
        break;
      }
      if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 125));
    } while (Date.now() < deadline);
    if (!matched)
      return {
        success: false,
        error: 'The recorded page is not open in the task tab. Replay stopped.',
      };
    assertCurrent();
    const result = await dispatch({
      ...message,
      actions: [action],
      expectedOrigin: origin,
      expectedPage: key,
    });
    if (!result.success) return result;
    performed++;
  }
  return { success: true, actionsPerformed: performed } as ExtensionResponse;
}
