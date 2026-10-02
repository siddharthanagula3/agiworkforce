import type { Metadata } from 'next';

const PRODUCT_TITLE = 'AGI';
const UNTITLED_CONVERSATION = 'New chat';
const MAX_TITLE_CHARS = 60;

export function conversationDocumentTitle(
  conversationTitle: string | null | undefined,
  inConversation: boolean,
): string {
  const raw = conversationTitle?.trim();
  const label = raw ? raw : inConversation ? UNTITLED_CONVERSATION : '';
  const trimmed =
    label.length > MAX_TITLE_CHARS ? `${label.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : label;
  return trimmed ? `${trimmed} · ${PRODUCT_TITLE}` : PRODUCT_TITLE;
}

export const NEW_CHAT_METADATA: Metadata = {
  title: { absolute: conversationDocumentTitle(null, false) },
};
