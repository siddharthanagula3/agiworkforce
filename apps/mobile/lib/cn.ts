import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind / NativeWind class strings, resolving conflicts.
 *
 * NOTE — NativeWind v4 limitation:
 * NativeWind v4 processes className strings at build time via a Babel/Metro
 * transform; only statically-analyzable strings are converted to StyleSheet
 * objects. twMerge produces dynamic strings that are not visible to the
 * build-time transform, so conflict resolution via twMerge is partially
 * degraded when the same property appears in multiple utility classes.
 *
 * In practice this means:
 *  - Deduplication of identical classes works fine (handled by clsx).
 *  - True conflict resolution (e.g. `text-sm` vs `text-lg`) may leave both
 *    classes in the output; the last one wins at runtime.
 *
 * For performance-critical or design-system components, prefer passing a
 * single resolved className string rather than relying on cn() to merge
 * conflicting utilities.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
