import { ExpiredShareBanner } from '@/features/chat/components/share/ExpiredShareBanner';

export default function SharedConversationNotFound() {
  return <ExpiredShareBanner reason="unavailable" />;
}
