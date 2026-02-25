import { createSupabaseServerClient } from '../../../services/supabase-server';
import { redirect } from 'next/navigation';
import { DashboardLayout } from '../../../components/dashboard/DashboardLayout';
import { MediaGallery } from '@/components/Media/MediaGallery';

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
    <DashboardLayout>
      <div className="space-y-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Media Generation</h1>
        <p className="text-zinc-400 text-sm">
          Generate images using AI. Powered by Google Imagen, DALL·E, and Stable Diffusion.
        </p>
      </div>
      <MediaGallery />
    </DashboardLayout>
  );
}
