'use client';

import { BadgeCheck } from 'lucide-react';

import { cn } from '../cn';
import { DIRECTORY_BADGE_LABELS, VERIFIED_GLYPH_BADGE } from './constants';
import type { DirectoryBadgeKind } from './types';

const PILL_CLASS = 'shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground';
const GLYPH_CLASS = 'size-4 shrink-0 text-muted-foreground';
const EMPTY_BADGES: readonly DirectoryBadgeKind[] = [];

export function isGlyphBadge(badge: DirectoryBadgeKind): boolean {
  return badge === VERIFIED_GLYPH_BADGE;
}

export function splitDirectoryBadges(badges: readonly DirectoryBadgeKind[] = EMPTY_BADGES): {
  glyphs: DirectoryBadgeKind[];
  pills: DirectoryBadgeKind[];
} {
  return {
    glyphs: badges.filter(isGlyphBadge),
    pills: badges.filter((badge) => !isGlyphBadge(badge)),
  };
}

export function DirectoryBadge({
  badge,
  className,
}: {
  badge: DirectoryBadgeKind;
  className?: string;
}) {
  if (isGlyphBadge(badge)) {
    return (
      <BadgeCheck
        role="img"
        aria-label={DIRECTORY_BADGE_LABELS[badge]}
        className={cn(GLYPH_CLASS, className)}
      />
    );
  }
  return <span className={cn(PILL_CLASS, className)}>{DIRECTORY_BADGE_LABELS[badge]}</span>;
}

export function DirectoryBadges({
  badges,
  className,
}: {
  badges?: readonly DirectoryBadgeKind[];
  className?: string;
}) {
  if (!badges || badges.length === 0) return null;
  return (
    <>
      {badges.map((badge) => (
        <DirectoryBadge key={badge} badge={badge} className={className} />
      ))}
    </>
  );
}
