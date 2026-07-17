/**
 * Local className combiner for @agiworkforce/ui.
 *
 * packages/ui/ui MUST NOT import a surface's `cn` (apps/desktop/lib/utils or
 * @shared/lib/utils) — that would couple the shared package to a surface.
 * Uses the same clsx+tailwind-merge stack both surfaces' own `cn` use, so a
 * caller's `className` override (e.g. shrinking an icon Button with
 * `className="h-7 w-7"`) actually wins over the component's own conflicting
 * Tailwind classes instead of both surviving in the DOM.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type { ClassValue };

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
