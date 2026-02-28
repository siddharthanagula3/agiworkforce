import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/services/supabase-server';
import { VerifyDeviceClient } from './verify-client';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const resolvedParams = await searchParams;
  const code = (resolvedParams.code || '').trim();

  if (!code) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-xl font-semibold">Device verification</h1>
          <p className="mt-2 text-sm text-zinc-400">Missing device code.</p>
        </div>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/verify?code=${code}`)}`);
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <h1 className="text-xl font-semibold">Link your device</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Approve this request to link your device to your AGI Workforce account.
        </p>

        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <div className="text-xs text-zinc-400">Code</div>
          <div className="mt-1 font-mono text-lg tracking-widest">{code.toUpperCase()}</div>
        </div>

        <VerifyDeviceClient code={code} />

        <p className="mt-6 text-xs text-zinc-500">
          Only approve if you initiated this from a device you control.
        </p>
      </div>
    </div>
  );
}
