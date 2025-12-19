'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabase-server';

type SubscriptionRow = {
  status: string;
};

function getDownloadUrls() {
  return {
    mac: process.env.NEXT_PUBLIC_DOWNLOAD_URL_MAC,
    windows: process.env.NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS,
    linux: process.env.NEXT_PUBLIC_DOWNLOAD_URL_LINUX,
  };
}

async function getUserAndSubscription() {
  const supabase = createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { userId: null as string | null, subscription: null as SubscriptionRow | null };
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return { userId: session.user.id, subscription };
}

export default async function DownloadPage() {
  const { userId, subscription } = await getUserAndSubscription();

  // Not logged in: send to login
  if (!userId) {
    redirect('/login');
  }

  // Logged in but no active subscription: send to pricing/upgrade flow
  if (!subscription || subscription.status !== 'active') {
    redirect('/pricing');
  }

  const downloads = getDownloadUrls();

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-2xl space-y-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Download AGI Workforce</h1>
          <p className="text-zinc-400">
            Thanks for being a Pro subscriber. Choose your platform below to download the latest
            desktop agent.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {downloads.mac && (
              <a
                href={downloads.mac}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-6 hover:border-blue-500 transition-colors"
              >
                <div className="text-lg font-semibold mb-2">macOS</div>
                <p className="text-sm text-zinc-400 mb-3">
                  Universal build for Apple Silicon/Intel
                </p>
                <span className="inline-flex h-9 items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-medium">
                  Download .dmg
                </span>
              </a>
            )}

            {downloads.windows && (
              <a
                href={downloads.windows}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-6 hover:border-blue-500 transition-colors"
              >
                <div className="text-lg font-semibold mb-2">Windows</div>
                <p className="text-sm text-zinc-400 mb-3">Supports Windows 10 and later</p>
                <span className="inline-flex h-9 items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-medium">
                  Download .exe
                </span>
              </a>
            )}

            {downloads.linux && (
              <a
                href={downloads.linux}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-6 hover:border-blue-500 transition-colors"
              >
                <div className="text-lg font-semibold mb-2">Linux</div>
                <p className="text-sm text-zinc-400 mb-3">AppImage for modern distros</p>
                <span className="inline-flex h-9 items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-medium">
                  Download AppImage
                </span>
              </a>
            )}
          </div>

          {!(downloads.mac || downloads.windows || downloads.linux) && (
            <p className="text-sm text-red-400">
              Download URLs are not configured. Please set the NEXT_PUBLIC_DOWNLOAD_URL_* env vars.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
