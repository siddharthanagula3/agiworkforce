'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { RELEASES, releasePath, type Release } from '@/lib/changelog-entries';
import { ProductNoticeCard } from './ProductNotice';

const LAST_SEEN_RELEASE_KEY = 'agi-last-seen-release';

function readLastSeen(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_RELEASE_KEY);
  } catch {
    return null;
  }
}

function markSeen(date: string): void {
  try {
    window.localStorage.setItem(LAST_SEEN_RELEASE_KEY, date);
  } catch {
    return;
  }
}

export function ReleaseNotice() {
  const [unseen, setUnseen] = useState<Release | null>(null);

  useEffect(() => {
    const latest = RELEASES[0];
    if (!latest) return;
    const lastSeen = readLastSeen();
    if (lastSeen === null) {
      markSeen(latest.date);
      return;
    }
    if (lastSeen < latest.date) setUnseen(latest);
  }, []);

  if (!unseen) return null;

  const dismiss = () => {
    markSeen(unseen.date);
    setUnseen(null);
  };

  return (
    <ProductNoticeCard
      icon={Sparkles}
      tone="info"
      message={`What's new: ${unseen.headline}`}
      action={
        <Button asChild size="sm" variant="outline" className="shrink-0 pointer-coarse:min-h-11">
          <Link href={releasePath(unseen)} onClick={dismiss}>
            Read more
          </Link>
        </Button>
      }
      onDismiss={dismiss}
    />
  );
}
