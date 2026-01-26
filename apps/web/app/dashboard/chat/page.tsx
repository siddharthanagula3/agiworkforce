import { redirect } from 'next/navigation';

// Redirect from old dashboard/chat to new /chat route
export default function DashboardChatRedirect() {
  redirect('/chat');
}
