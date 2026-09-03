/**
 * Make a profile name presentable.
 *
 * Only the two unambiguously-wrong shapes are touched:
 *   ALL CAPS  -> Title Case   ("SIDDHARTHA" -> "Siddhartha")
 *   all lower -> Title Case   ("siddhartha" -> "Siddhartha")
 *
 * Anything with deliberate internal capitalisation is left exactly as written,
 * so "McDonald", "d'Angelo", "DeShawn" and "van Dijk" survive. Two-letter
 * all-caps names are also left alone because those are initials ("JT", "AJ"),
 * and title-casing them would be the same class of error in reverse.
 * Hyphens and apostrophes start new words, so "O'BRIEN" -> "O'Brien" and
 * "MARY-JANE" -> "Mary-Jane".
 *
 * @example
 * ```typescript
 * normalizeDisplayName('SIDDHARTHA NAGULA'); // "Siddhartha Nagula"
 * normalizeDisplayName('McDonald');          // "McDonald"
 * normalizeDisplayName('JT');                // "JT"
 * ```
 */
export function normalizeDisplayName(name: string): string {
  const hasLower = name !== name.toLocaleUpperCase();
  const hasUpper = name !== name.toLocaleLowerCase();

  if (hasLower && hasUpper) return name;
  if (!hasLower && name.length <= 2) return name;
  if (!hasLower && !hasUpper) return name;

  return name
    .toLocaleLowerCase()
    .replace(
      /(^|[\s\-'’])(\p{L})/gu,
      (_match, boundary: string, letter: string) => boundary + letter.toLocaleUpperCase(),
    );
}

export function resolveAccountDisplayName(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback = 'User',
): string {
  const trimmedName = name?.trim();
  if (trimmedName) return normalizeDisplayName(trimmedName);

  const localPart = email?.trim().split('@')[0]?.trim();
  if (localPart) return normalizeDisplayName(localPart);

  return fallback;
}

export function accountInitial(displayName: string, fallback = '?'): string {
  const match = displayName.match(/\p{L}|\p{N}/u);
  return (match?.[0] ?? fallback).toLocaleUpperCase();
}
