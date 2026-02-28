import { createSupabaseServerClient } from '@/services/supabase-server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import ChatLayoutShell from './ChatLayoutShell';

export const dynamic = 'force-dynamic';

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  return <ChatLayoutShell>{children}</ChatLayoutShell>;
}
