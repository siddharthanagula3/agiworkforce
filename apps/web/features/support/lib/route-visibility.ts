/**
 * Where the support launcher may and may not appear, and which visual surface
 * it adopts.
 *
 * The blocklist is seeded from `AUTO_PROMPT_BLOCKLIST` in
 * features/marketing/components/WaitlistModal.tsx and exists for the same
 * verified reason recorded there: a global floating overlay appeared on top of
 * the `/connect/[deviceType]` "Approve / Deny" prompt and took focus away from
 * the decision. A support bubble over an approval, auth, share or status page is
 * the same defect. This list is deliberately default-OPEN (anything not named
 * here shows the launcher), so it must be extended whenever a new
 * decision-shaped route lands.
 */

/** Routes where the launcher renders NOTHING. */
export const SUPPORT_WIDGET_BLOCKLIST: readonly string[] = [
  // Auth decisions — a floating overlay must not compete with a sign-in form.
  '/login',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/register',
  '/verify',
  '/auth',
  // Device pairing approvals. See the WaitlistModal note: an overlay here
  // stole focus from a real Approve/Deny decision.
  '/connect',
  '/device-auth',
  // Public share recipients and incident pages.
  '/share',
  '/shared',
  '/status',
  // The support pages already host the real contact routes; a bubble on top of
  // them is noise, and the /support page is also the widget's own honest
  // fallback destination.
  '/support',
  // Artifact sandbox origin — sandboxed documents must stay chrome-free.
  '/artifact-sandbox',
];

/**
 * Signed-in product surfaces. Matching one of these makes the widget adopt the
 * product (shadcn token) look instead of the marketing `[data-design="agi"]`
 * palette.
 *
 * FAILURE MODE TO KNOW ABOUT: a *new* marketing route is not listed here and
 * therefore correctly gets the marketing palette; a new *product* route that is
 * not listed here gets the marketing palette by mistake. The consequence is
 * cosmetic (dark editorial panel on a product page), never functional — the
 * signed-in behaviour is driven by the account-context response, not by this
 * list.
 */
export const SUPPORT_APP_ROUTE_PREFIXES: readonly string[] = [
  '/chat',
  '/chats',
  '/library',
  '/projects',
  '/artifacts',
  '/settings',
  '/billing',
  '/usage',
  '/admin',
  '/schedules',
  '/tasks',
  '/connectors',
  '/skills',
  '/dashboard',
  '/code',
];

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname === `${prefix}`,
  );
}

/** `false` on every blocklisted route. A null pathname is treated as unknown → hidden. */
export function isSupportWidgetVisible(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !matches(pathname, SUPPORT_WIDGET_BLOCKLIST);
}

export function resolveSupportSurface(pathname: string | null | undefined): 'app' | 'marketing' {
  if (!pathname) return 'marketing';
  return matches(pathname, SUPPORT_APP_ROUTE_PREFIXES) ? 'app' : 'marketing';
}
