import { redirect } from 'next/navigation';

// Dashboard eliminated — all users go straight to chat
export default function DashboardPage() {
  redirect('/chat');
}
