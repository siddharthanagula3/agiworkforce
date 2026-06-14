/**
 * Local className combiner for @agiworkforce/ui.
 *
 * packages/ui MUST NOT import a surface's `cn` (apps/desktop/lib/utils or
 * @shared/lib/utils) — that would couple the shared package to a surface.
 * This is a minimal, dependency-free join: it filters falsy values and
 * collapses whitespace. It deliberately does NOT do Tailwind class merging
 * (no tailwind-merge dependency) — callers pass non-conflicting classes, and
 * the component's own classes come last so an explicit `className` override
 * still wins via CSS source order.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values
    .filter((value): value is string | number => Boolean(value))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
