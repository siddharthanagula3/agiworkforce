'use client';

import { Apple, Laptop, Terminal } from 'lucide-react';
import { useState } from 'react';
import { triggerDownload } from '../services/download';
import { cn } from '../utils/cn';

interface DownloadUrls {
  mac?: string;
  windows?: string;
  linux?: string;
}

export function DownloadSection({ downloads }: { downloads: DownloadUrls }) {
  const [detectedOS] = useState<'mac' | 'windows' | 'linux' | 'unknown'>(() => {
    if (typeof window === 'undefined') return 'windows';
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (userAgent.indexOf('mac') !== -1) return 'mac';
    if (userAgent.indexOf('linux') !== -1) return 'linux';
    if (userAgent.indexOf('win') !== -1) return 'windows';
    return 'unknown';
  });

  const platforms = [
    {
      id: 'mac' as const,
      name: 'macOS',
      icon: Apple,
      url: downloads.mac,
      description: 'Universal build for Apple Silicon & Intel',
      extension: '.dmg',
    },
    {
      id: 'windows' as const,
      name: 'Windows',
      icon: Laptop,
      url: downloads.windows,
      description: 'Supports Windows 10 and later',
      extension: '.exe',
    },
    {
      id: 'linux' as const,
      name: 'Linux',
      icon: Terminal,
      url: downloads.linux,
      description: 'AppImage for modern distributions',
      extension: '.AppImage',
    },
  ];

  return (
    <div className="mt-12 grid gap-6 md:grid-cols-3">
      {platforms.map((platform) => {
        const isDetected = detectedOS === platform.id;

        const isComingSoon = platform.id === 'windows' || platform.id === 'linux';

        if (!platform.url && !isComingSoon) return null;

        return (
          <button
            key={platform.id}
            onClick={() => !isComingSoon && triggerDownload(platform.id)}
            disabled={isComingSoon}
            className={cn(
              'relative flex flex-col items-center rounded-2xl border p-8 transition-all duration-300 text-left w-full',
              !isComingSoon && 'hover:scale-[1.02]',
              isDetected && !isComingSoon
                ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                : 'border-zinc-800 bg-zinc-950/50',
              !isComingSoon && 'hover:border-zinc-700',
              isComingSoon && 'opacity-75 cursor-not-allowed',
            )}
          >
            {isDetected && !isComingSoon && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                Detected your OS
              </div>
            )}

            {isComingSoon && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-zinc-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                Coming Soon
              </div>
            )}

            <platform.icon
              className={cn(
                'h-10 w-10 mb-4',
                isDetected && !isComingSoon ? 'text-blue-400' : 'text-zinc-500',
              )}
            />

            <div className="text-xl font-bold mb-2">{platform.name}</div>
            <p className="text-sm text-zinc-400 mb-6 text-center leading-relaxed">
              {platform.description}
            </p>

            <span
              className={cn(
                'inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold transition-colors',
                isDetected && !isComingSoon
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-zinc-800 text-zinc-200',
                !isComingSoon && !isDetected && 'hover:bg-zinc-700',
              )}
            >
              {isComingSoon ? 'Coming Soon' : `Download ${platform.extension}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
