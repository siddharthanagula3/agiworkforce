import { redirect } from 'next/navigation';

// Dashboard eliminated — redirect to /chat (served via same-domain rewrite)
export default function DashboardPage() {
  redirect('/chat');
}
