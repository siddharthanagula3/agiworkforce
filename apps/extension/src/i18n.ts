/**
 * User-facing copy for the extension.
 *
 * `_locales/en/messages.json` is the single catalog and the only one: the
 * manifest declares `default_locale`, the build copies `_locales/` into the
 * package, and Chrome serves it — plus any translated sibling locale added
 * later — through `chrome.i18n.getMessage`. Chrome already falls back to the
 * default locale per key, so a second copy of the English catalog bundled here
 * would only be a place for the two to drift apart.
 *
 * The JSON is imported for its type alone; the binding is unused at runtime and
 * is erased from both bundles.
 */
import catalog from '../_locales/en/messages.json';

/** Every key the catalog defines. `t()` takes only these, checked by tsc. */
type MessageKey = keyof typeof catalog;

/**
 * Look up a localized message by catalog key.
 *
 * `chrome.i18n` is available unconditionally in both callers — the MV3 service
 * worker (`background.ts`) and the side-panel extension page (`side_panel.ts`)
 * — so there is no non-Chrome path. A suite that executes either module under
 * jsdom has to put `i18n.getMessage` on its Chrome shim; see
 * `__tests__/side_panel-attachment-caps.test.ts`.
 */
export function t(key: MessageKey, substitutions: readonly string[] = []): string {
  return chrome.i18n.getMessage(key, [...substitutions]);
}
