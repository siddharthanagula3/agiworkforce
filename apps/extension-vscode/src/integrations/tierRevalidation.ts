/**
 * One-way signal that the cached plan tier may be out of date.
 *
 * Kept in its own module so `utils/api` can raise it without importing the
 * resolver that reads the account API, which would close an import cycle.
 */

let listener: (() => void) | undefined;

export function onAccountTierMayHaveChanged(handler: () => void): void {
  listener = handler;
}

export function clearAccountTierRevalidationListener(): void {
  listener = undefined;
}

export function notifyAccountTierMayHaveChanged(): void {
  listener?.();
}
