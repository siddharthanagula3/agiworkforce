'use client';

import { Clock, Download } from 'lucide-react';
import { triggerDownload } from '../services/download';

export function DirectDownloadButtons() {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
      <button
        onClick={() => triggerDownload('mac')}
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors text-white"
      >
        <Download className="h-5 w-5" />
        Download for macOS
      </button>
      <button
        type="button"
        disabled
        title="Windows installer coming Q3 2026. Use the web app or CLI in the meantime."
        className="flex items-center gap-2 px-6 py-3 bg-zinc-900 rounded-lg font-medium text-zinc-500 cursor-not-allowed"
      >
        <Clock className="h-5 w-5" />
        Windows: Coming Q3 2026
      </button>
      <button
        onClick={() => triggerDownload('linux')}
        className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition-colors text-white"
      >
        <Download className="h-5 w-5" />
        Download for Linux
      </button>
    </div>
  );
}
