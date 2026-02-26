import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';

export function BrowserActivityBadge() {
  const [active, setActive] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent).detail as { active: boolean; url: string };
      setActive(detail.active);
      setUrl(detail.url || '');
    }
    window.addEventListener('agi:browser-active', handle);
    return () => window.removeEventListener('agi:browser-active', handle);
  }, []);

  if (!active) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-xs text-blue-400">
      <Globe className="h-3 w-3 animate-pulse" />
      <span className="max-w-[140px] truncate">{url || 'Browser active'}</span>
    </div>
  );
}
