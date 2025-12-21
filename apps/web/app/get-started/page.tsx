'use client';

import { Button } from '@/components/ui';
import { Bot, CheckCircle2, Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

function getDownloadUrl() {
  // Detect OS and return appropriate download URL
  if (typeof window === 'undefined') return null;

  const userAgent = window.navigator.userAgent.toLowerCase();

  if (userAgent.includes('mac') || userAgent.includes('darwin')) {
    return {
      url: '/api/download-beta?platform=mac',
      platform: 'macOS',
      filename: 'AGI-Workforce.dmg',
    };
  } else if (userAgent.includes('win')) {
    return {
      url: '/api/download-beta?platform=windows',
      platform: 'Windows',
      filename: 'AGI-Workforce-Setup.exe',
    };
  } else if (userAgent.includes('linux')) {
    return {
      url: '/api/download-beta?platform=linux',
      platform: 'Linux',
      filename: 'AGI-Workforce.AppImage',
    };
  }

  // Default to Mac
  return {
    url: '/api/download-beta?platform=mac',
    platform: 'macOS',
    filename: 'AGI-Workforce.dmg',
  };
}

export default function GetStartedPage() {
  const [downloadInfo] = useState<{
    url: string;
    platform: string;
    filename: string;
  } | null>(() => getDownloadUrl());
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [autoDownloadAttempted, setAutoDownloadAttempted] = useState(false);

  const triggerDownload = (url: string) => {
    setDownloadStarted(true);
    // Create a hidden link and click it to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    // Auto-start download after a short delay
    if (downloadInfo && !autoDownloadAttempted) {
      const timer = setTimeout(() => {
        triggerDownload(downloadInfo.url);
        setAutoDownloadAttempted(true);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [autoDownloadAttempted, downloadInfo]);

  const handleManualDownload = () => {
    if (downloadInfo) {
      triggerDownload(downloadInfo.url);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="fixed top-0 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tighter">
            <Bot className="h-6 w-6 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-12">
        <div className="w-full max-w-2xl space-y-8 text-center">
          {/* Success Icon */}
          <div className="mx-auto w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>

          {/* Main Message */}
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">You&apos;re all set!</h1>
            <p className="text-xl text-zinc-400">Your download should start automatically...</p>
          </div>

          {/* Download Status */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 space-y-6">
            {downloadStarted ? (
              <div className="flex items-center justify-center gap-3 text-green-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-lg">
                  Downloading AGI Workforce for {downloadInfo?.platform}...
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-lg">Preparing your download...</span>
              </div>
            )}

            <div className="border-t border-zinc-800 pt-6">
              <p className="text-zinc-500 mb-4">
                Download didn&apos;t start? Click the button below:
              </p>
              <Button
                onClick={handleManualDownload}
                className="h-14 px-8 text-lg bg-blue-600 hover:bg-blue-700"
              >
                <Download className="mr-2 h-5 w-5" />
                Download for {downloadInfo?.platform || 'Desktop'}
              </Button>
            </div>
          </div>

          {/* Other Platforms */}
          <div className="space-y-4">
            <p className="text-zinc-500 text-sm">Looking for a different platform?</p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="/api/download-beta?platform=mac"
                className="text-sm text-zinc-400 hover:text-white transition-colors underline"
              >
                macOS
              </a>
              <a
                href="/api/download-beta?platform=windows"
                className="text-sm text-zinc-400 hover:text-white transition-colors underline"
              >
                Windows
              </a>
              <a
                href="/api/download-beta?platform=linux"
                className="text-sm text-zinc-400 hover:text-white transition-colors underline"
              >
                Linux
              </a>
            </div>
          </div>

          {/* Next Steps */}
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6 text-left space-y-4">
            <h3 className="font-semibold text-lg">Next Steps:</h3>
            <ol className="list-decimal list-inside space-y-2 text-zinc-400">
              <li>Open the downloaded file</li>
              <li>Follow the installation instructions</li>
              <li>Sign in with your account</li>
              <li>Start building your AI workforce!</li>
            </ol>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-black py-8">
        <div className="container mx-auto px-4 text-center">
          <div className="text-sm text-zinc-600">
            © {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
