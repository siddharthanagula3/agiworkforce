/**
 * Presentation rules for a human name that came from an identity provider.
 *
 * Every surface renders the signed-in user's name somewhere prominent — the
 * web greeting headline and sidebar account row, the mobile settings header,
 * the desktop account menu — and every one of them inherits whatever casing
 * Clerk (or Google, or Apple) happens to have stored. A profile saved as
 * "SIDDHARTHA NAGULA" shouts from the largest text on the empty-chat screen,
 * which reads as a bug in a product demo.
 *
 * This lives in the shared package rather than next to any one surface's
 * component because the rule is a product decision, not a web layout detail:
 * fixing it in the web greeting and leaving the sidebar (and mobile, and
 * desktop) shouting is exactly the inconsistency the founder saw on screen.
 *
 * @module displayName
 * @packageDocumentation
 */

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

  // Mixed case is intentional — never second-guess it.
  if (hasLower && hasUpper) return name;
  // Initials, not a shouted name.
  if (!hasLower && name.length <= 2) return name;
  // No cased characters at all (e.g. CJK, digits) — nothing to normalise.
  if (!hasLower && !hasUpper) return name;

  return name
    .toLocaleLowerCase()
    .replace(
      /(^|[\s\-'’])(\p{L})/gu,
      (_match, boundary: string, letter: string) => boundary + letter.toLocaleUpperCase(),
    );
}

/**
 * The name to show for a signed-in user, given whatever the identity provider
 * supplied. Falls back to the email local-part, then to a neutral label —
 * never renders an empty string or "undefined" into the UI.
 *
 * The email fallback is normalised too: a local-part is usually lowercase
 * ("jsmith"), and "Jsmith" reads far better than "jsmith" in an account row.
 */
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

/**
 * The single letter shown in an avatar circle. Uses the FIRST CASED letter so
 * a name like "_siddhartha" or "(dev) Sam" does not render punctuation as the
 * user's identity.
 */
export function accountInitial(displayName: string, fallback = '?'): string {
  const match = displayName.match(/\p{L}|\p{N}/u);
  return (match?.[0] ?? fallback).toLocaleUpperCase();
}
