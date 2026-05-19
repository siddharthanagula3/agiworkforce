import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../services/supabase-server';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default async function ChatLayout({ children }: { children: ReactNode }) {
  // WEB-18 (audit 2026-05-19): getUser() re-validates the JWT against the
  // auth server. getSession() only reads cookie state without revalidation
  // and must not be the auth gate.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/chat');
  }

  return <>{children}</>;
}
