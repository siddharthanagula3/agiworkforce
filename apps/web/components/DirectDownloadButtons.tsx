'use client';

import Link from 'next/link';
import { Clock, MonitorDown } from 'lucide-react';

export function DirectDownloadButtons() {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
      <Link
        href="/desktop"
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors text-white"
      >
        <MonitorDown className="h-5 w-5" />
        Desktop details
      </Link>
      <Link
        href="/waitlist"
        className="flex items-center gap-2 px-6 py-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg font-medium text-zinc-200 transition-colors"
      >
        <Clock className="h-5 w-5" />
        Windows waitlist
      </Link>
      <Link
        href="/desktop"
        className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition-colors text-white"
      >
        <MonitorDown className="h-5 w-5" />
        Linux details
      </Link>
    </div>
  );
}
