import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../services/supabase-server';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default async function BillingLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login?redirectTo=/billing');
  }

  return <>{children}</>;
}
