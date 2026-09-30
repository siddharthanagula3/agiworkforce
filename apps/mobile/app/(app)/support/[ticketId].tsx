import { useLocalSearchParams } from 'expo-router';
import { SupportTicketScreen } from '@/src/features/support';

export default function SupportTicketRoute() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  return <SupportTicketScreen ticketId={String(ticketId ?? '')} />;
}
