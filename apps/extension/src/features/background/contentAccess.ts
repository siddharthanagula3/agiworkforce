export interface ContentScriptSender {
  readonly id?: string;
  readonly url?: string;
  readonly frameId?: number;
  readonly tab?: { readonly id?: number };
}

export const CONTENT_SENDER_REFUSAL = 'Only the page itself can ask about its own access.';
export const AUTOFILL_NOT_APPROVED_ERROR =
  'Autofill is blocked here, this site is not on your approved-site allowlist';
export const AUTOFILL_UNSUPPORTED_PAGE_ERROR =
  'Autofill does not support this page. Open the application form on a supported job board.';
export const AUTOFILL_PROFILE_UNREADABLE_ERROR =
  'Your autofill profile could not be read. Try again, or re-save it in Options.';

/**
 * The page a content-script message speaks for, taken from what Chrome reports
 * about the sender rather than from anything in the message. Only this
 * extension's script in a tab's top frame on an http(s) page qualifies.
 */
export function contentScriptPageUrl(
  sender: ContentScriptSender,
  extensionId: string,
): string | null {
  if (sender.id !== extensionId || typeof sender.tab?.id !== 'number' || sender.frameId !== 0)
    return null;
  if (typeof sender.url !== 'string') return null;
  try {
    const parsed = new URL(sender.url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
