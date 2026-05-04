/**
 * Minimal string coercion helpers used by the normalization layer.
 *
 * Subset of OpenClaw's src/shared/string-coerce.ts (MIT, Peter Steinberger).
 * See THIRD_PARTY_LICENSES.md at repo root for full attribution.
 */

export function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeOptionalString(value: unknown): string | undefined {
  return normalizeNullableString(value) ?? undefined;
}

export function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  return normalizeOptionalString(value)?.toLowerCase();
}

export function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return normalizeOptionalLowercaseString(value) ?? '';
}
