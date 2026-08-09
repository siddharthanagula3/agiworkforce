'use client';

/**
 * WHY THE DIRECTIVE. `react-i18next` calls `createContext` at module scope, and
 * `createContext` does not exist in React's `react-server` condition. This
 * module is reachable from a SERVER component: `@agiworkforce/ui` resolves to
 * the barrel `src/index.ts`, the barrel re-exports `useUiTranslation` from
 * here, and `apps/web/features/marketing/components/MarketingFooter.tsx` — a
 * server component — imports `AgiMark` through that same barrel. Importing one
 * pure SVG therefore evaluated react-i18next in the server graph:
 *
 *     Failed to collect configuration for /about
 *       [cause]: TypeError: (0 , o.createContext) is not a function
 *
 * That failed EVERY marketing page — each one renders MarketingFooter — and the
 * build only ever named whichever it reached first, which is why the reported
 * route moved between /about, /acceptable-use, /accessibility and
 * /agent-permissions across runs while the cause stayed the same.
 *
 * A module whose entire public surface is a React hook over context is
 * client-side by nature, so the boundary belongs here rather than on every
 * consumer. The barrel's sidebar components already carry it; this one was
 * missed when `c5d67f7be` added `useUiTranslation` to the barrel. The directive
 * is inert in the non-Next hosts (desktop, mobile) that also import this file.
 */

/**
 * i18n.ts — how shared components read translated copy.
 *
 * `@agiworkforce/ui` and `@agiworkforce/unified-chat` render inside three
 * hosts that each construct their own i18next instance (web adds a browser
 * language detector, desktop persists to its own store, mobile uses
 * expo-localization). A shared component cannot assume it can see any of
 * them, so the English text is not optional here — it is a required argument
 * that travels to i18next as `defaultValue`, and is returned verbatim
 * whenever the key resolves to nothing.
 *
 * WHERE THIS ACTUALLY TRANSLATES, TODAY:
 *
 * - Desktop and mobile: yes. `apps/desktop/src/i18n/index.ts` and
 *   `apps/mobile` both depend on `react-i18next@^17.0.6`, which resolves to
 *   the same physical copy this file resolves (the root-hoisted 17.0.7).
 *   Same module, same `I18nContext`, same default instance — so `hasInstance`
 *   is true and the key lookup runs.
 * - Web: NO. `apps/web/package.json` pins `react-i18next@^17.0.1` /
 *   `i18next@^26.0.2`, which the lockfile resolves to 17.0.1 / 26.0.2 in
 *   `apps/web/node_modules`, while this package (having no link of its own)
 *   resolves the root-hoisted 17.0.7 / 26.1.0. Two physical copies means two
 *   module-scoped `I18nContext`s and two default-instance registries, so the
 *   instance `apps/web/app/providers.tsx` mounts is invisible here.
 *   `hasInstance` is permanently false on web and every string below renders
 *   its English argument no matter what locale the user picked. react-i18next
 *   logs its own `NO_I18NEXT_INSTANCE` warning when that happens.
 *
 *   Fixing that is a lockfile dedupe in `apps/web` (its `^17.0.1` range
 *   already admits 17.0.7), not a change in this file — it belongs to the web
 *   i18n adoption item, ExecutionPlan #73. Until then, treat web as English.
 *
 * The other half of the gap is the corpus: most keys passed below do not yet
 * exist in `packages/ui/i18n/locales`, so even on desktop they resolve to the
 * English `defaultValue`. Only keys that already ship in the corpus (e.g.
 * `chat:newChat`, `chat:retry`, `common:search`, `common:loading`) translate
 * into all 12 locales right now. Adding the rest means writing under
 * `packages/ui/i18n/locales/**`, which is the i18n key-parity item's ground.
 *
 * What this file does guarantee in every host is the floor: never a raw key
 * (`chat.newChat`) and never a raw placeholder (`Archived ({{count}})`) in
 * rendered output — the regression desktop's `wdio/specs/i18n-raw-keys.spec.ts`
 * exists to catch.
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The namespaces `@agiworkforce/i18n` ships. Kept as a literal union rather
 * than imported so this module stays free of a runtime dependency on the
 * corpus — hosts already own loading it.
 */
export type UiNamespace =
  | 'common'
  | 'chat'
  | 'settings'
  | 'auth'
  | 'errors'
  | 'models'
  | 'pricing'
  | 'v3';

export interface UiTranslate {
  /**
   * @param key Key inside the namespace passed to `useUiTranslation`.
   * @param english Source copy. Required, and used verbatim when the key has
   *   no translation in the active locale.
   * @param values Interpolation values for `{{placeholders}}` in the copy.
   */
  (key: string, english: string, values?: Record<string, unknown>): string;
}

export interface UiTranslation {
  t: UiTranslate;
}

/**
 * Fill `{{placeholders}}` the way i18next would.
 *
 * Reached whenever no i18next instance is visible to this module's copy of
 * react-i18next — which is every render in `apps/web` (see above), plus any
 * host or test that renders a shared component without a provider. Without
 * this, react-i18next's not-ready `t` hands back `defaultValue` untouched and
 * the archive toggle reads "Archived ({{count}})" — a raw placeholder is the
 * same class of defect as a raw key.
 */
function interpolate(template: string, values: Record<string, unknown> | undefined): string {
  if (!values) return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Translate copy in `namespace`, falling back to the supplied English.
 */
export function useUiTranslation(namespace: UiNamespace): UiTranslation {
  const { t, i18n } = useTranslation(namespace);
  // react-i18next returns `i18n: {}` when it cannot find an instance, so the
  // absence of `t` on it is the signal that `t` above is the key-echoing
  // `notReadyT` rather than a real `getFixedT`.
  const hasInstance = typeof i18n?.t === 'function';

  const translate = useCallback<UiTranslate>(
    (key, english, values) => {
      if (!hasInstance) return interpolate(english, values);
      // `defaultValue` last: a caller's interpolation values must never be
      // able to displace the English fallback and reintroduce raw keys.
      return t(key, { ...values, defaultValue: english }) as string;
    },
    [t, hasInstance],
  );

  return useMemo(() => ({ t: translate }), [translate]);
}
