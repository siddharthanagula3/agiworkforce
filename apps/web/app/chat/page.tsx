import { WebChatRoot } from '@/features/chat/components/WebChatRoot';

/**
 * `/chat` predates the move of the product onto the root domain (2026-08-08).
 * It stays a real route rather than a redirect because it has been a linkable,
 * bookmarked URL and every `/chat/*` child still lives here; `app/page.tsx`
 * mounts the same component for signed-in visitors on `/`.
 */
export default function Page() {
  return <WebChatRoot />;
}
