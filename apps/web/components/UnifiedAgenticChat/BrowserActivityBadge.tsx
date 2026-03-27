import { useEffect, useState } from 'react';
import type { BrowserActivityEventDetail } from '@agiworkforce/types';
import { Globe } from 'lucide-react';

export function BrowserActivityBadge() {
  const [detail, setDetail] = useState<BrowserActivityEventDetail>({ active: false, url: '' });

  useEffect(() => {
    function handle(e: Event) {
      setDetail((e as CustomEvent<BrowserActivityEventDetail>).detail);
    }
    window.addEventListener('agi:browser-active', handle);
    return () => window.removeEventListener('agi:browser-active', handle);
  }, []);

  if (!detail.active) return null;

  const label =
    detail.status === 'planning'
      ? `Planning on ${detail.url || 'browser'}`
      : detail.status === 'executing'
        ? `Acting on ${detail.url || 'browser'}`
        : detail.status === 'error'
          ? detail.lastAction || 'Browser issue'
          : detail.lastAction || detail.url || 'Browser active';

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-xs text-blue-400">
      <Globe className="h-3 w-3 animate-pulse" />
      <span className="max-w-[180px] truncate">{label}</span>
    </div>
  );
}
