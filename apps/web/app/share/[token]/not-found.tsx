import { ExpiredShareBanner } from '@/features/chat/components/share/ExpiredShareBanner';

export default function SharedConversationNotFound() {
  return (
    <main id="main-content" data-route-state="not-found">
      <ExpiredShareBanner />
    </main>
  );
}
