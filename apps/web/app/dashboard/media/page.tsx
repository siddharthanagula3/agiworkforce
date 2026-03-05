'use client';

import { Film, Sparkles } from 'lucide-react';

export default function MediaPage() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <div className="relative mb-8">
        <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-blue-500/20 blur-xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500">
          <Film className="h-10 w-10 text-white" />
        </div>
      </div>

      <h1 className="mb-3 text-3xl font-bold text-white">Media Studio</h1>

      <div className="mb-6 flex items-center gap-2 rounded-full bg-purple-500/10 px-4 py-1.5 text-sm text-purple-400">
        <Sparkles className="h-4 w-4" />
        Coming Soon
      </div>

      <p className="max-w-md text-center text-zinc-400">
        Generate images, videos, and creative media with AI. Connect your favorite models and create
        stunning visuals directly from chat.
      </p>
    </div>
  );
}
