import { Bot } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DownloadSection } from '../../components/DownloadSection';
import { DirectDownloadButtons } from '../../components/DirectDownloadButtons';
import { createSupabaseServerClient } from '../../services/supabase-server';

export const dynamic = 'force-dynamic';

function getDownloadUrls() {
  return {
    mac: process.env.NEXT_PUBLIC_DOWNLOAD_URL_MAC || '/downloads/agi-workforce-mac.dmg',
    windows: process.env.NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS || '/downloads/agi-workforce-win.exe',
    linux: process.env.NEXT_PUBLIC_DOWNLOAD_URL_LINUX || '/downloads/agi-workforce-linux.AppImage',
  };
}

export default async function DownloadPage() {
  const supabase = await createSupabaseServerClient();

  // Get session
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Session error:', sessionError);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Service Temporarily Unavailable</h1>
          <p className="text-zinc-400">Please try again later or contact support.</p>
          <Link href="/" className="text-blue-400 hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  // Not logged in: send to login with redirect back to download
  if (!session?.user) {
    redirect('/login?redirectTo=/download');
  }

  // const userId = session.user.id;

  /* 
  // Check subscription status - require active subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, plan_tier')
    .eq('user_id', userId)
    .maybeSingle();
  */

  /* 
  const activeStatuses = ['active', 'trialing'];
  const hasActiveSubscription =
    subscription && activeStatuses.includes(subscription.status); 
  */

  /* 
  // Strict subscription check temporarily disabled for Beta access
  if (!hasActiveSubscription) {
    redirect('/pricing?reason=subscription_required');
  }
  */

  // Optional: Show upgrade banner if no subscription
  // const showUpgradeBanner = !hasActiveSubscription;

  const downloads = getDownloadUrls();

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="fixed top-0 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tighter">
            <Bot className="h-6 w-6 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-12">
        <div className="w-full max-w-5xl space-y-12">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
              Download AGI Workforce
            </h1>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Experience the power of an autonomous AI workforce directly on your machine. Secure,
              private, and blazing fast.
            </p>
          </div>

          <DownloadSection downloads={downloads} />

          {/* Direct download buttons for beta users */}
          <DirectDownloadButtons />

          <div className="text-center text-sm text-zinc-500">
            <p>By downloading, you agree to our Terms of Service and Privacy Policy.</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-black py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="text-sm text-zinc-600">
            © {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
