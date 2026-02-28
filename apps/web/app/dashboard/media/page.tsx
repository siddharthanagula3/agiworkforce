import { createSupabaseServerClient } from '../../../services/supabase-server';
import { redirect } from 'next/navigation';
import { MediaStudio } from '@/components/Media/MediaStudio';

export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="py-6">
      <MediaStudio />
    </div>
  );
}
