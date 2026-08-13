'use client';

/**
 * Keep the browser tab title on the conversation you are actually reading.
 *
 * The product moved onto the root domain (auth-aware `/`, the chatgpt.com
 * shape), which left the signed-in app rendering under the MARKETING metadata:
 * a user deep in a conversation had a tab reading "AGI | One AI Workspace. Six
 * Surfaces. Your Rules." Conversation routes were no better — every
 * `/chat/<sessionId>` shared one static string, so a window with several chats
 * open gave no way to tell them apart, and screen recordings show the tab bar.
 *
 * This cannot be `export const metadata`, because the title depends on client
 * state that changes WITHOUT navigation: renaming a chat, or the server
 * auto-titling a brand-new one mid-stream.
 *
 * Deliberately NOT restoring the previous title on unmount. An in-app route
 * change unmounts the old tree after the new one has mounted, so a restore
 * would race the incoming title and win — which is exactly why the first
 * version of this worked on `/` and appeared broken on `/chat/<id>`. The
 * marketing render never mounts this (it is inside the signed-in chat page),
 * so there is nothing to put back.
 */

import { useEffect } from 'react';

const SUFFIX = 'AGI';
/** Long titles are truncated by the browser anyway; keep the suffix reachable. */
const MAX_TITLE_CHARS = 60;

export function useDocumentTitleSync(
  activeConversationId: string | null,
  conversationTitle: string | undefined,
): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const raw = conversationTitle?.trim();
    // An untitled conversation is the normal state for the first seconds of a
    // new chat, before the server names it. "New chat" is the honest label —
    // better than flashing a raw id or leaving the marketing tagline up.
    const label = raw && raw.length > 0 ? raw : activeConversationId ? 'New chat' : '';
    const trimmed =
      label.length > MAX_TITLE_CHARS ? `${label.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : label;

    document.title = trimmed ? `${trimmed} · ${SUFFIX}` : SUFFIX;
  }, [activeConversationId, conversationTitle]);
}
