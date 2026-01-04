'use client';

import { Bot } from 'lucide-react';
import Link from 'next/link';
import { DownloadSection } from '../../components/DownloadSection';
import { DirectDownloadButtons } from '../../components/DirectDownloadButtons';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../services/supabase';

function getDownloadUrls() {
  return {
    mac: process.env.NEXT_PUBLIC_DOWNLOAD_URL_MAC || '/downloads/agiworkforce.dmg',
    windows: process.env.NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS || '/api/download?platform=windows',
    linux: process.env.NEXT_PUBLIC_DOWNLOAD_URL_LINUX || '/api/download?platform=linux',
  };
}

export default function DownloadPage() {
  const [hasSession, setHasSession] = useState<boolean>(false);
  const downloads = getDownloadUrls();

  useEffect(() => {
    const checkSession = async () => {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setHasSession(!!session?.user);
    };
    checkSession();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="fixed top-0 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tighter">
            <Bot className="h-6 w-6 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
          <div className="flex items-center gap-4">
            {hasSession ? (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
              >
                Sign In
              </Link>
            )}
            <Link
              href="/"
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Back to Home
            </Link>
          </div>
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

          {}
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
