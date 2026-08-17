/**
 * WebShellV3 — route table for the v3 web sidebar's nav views.
 *
 * The v3 shell component itself is dead (its only mount was
 * `UnifiedChatPage`, which has been removed — `/chat` is served by
 * `WebChatPage` via `WebChatRoot`). What remains is a route table plus the
 * `V3Mode` type used by `WebSidebar.tsx`, and `WebSidebar` itself now has no
 * mount either: `CloudCodePage` moved to `WebAppShell`. So this whole `v3/`
 * directory is currently reachable only from its own tests — it is awaiting a
 * delete-or-adopt decision, not live code.
 *
 * Do not reintroduce a mounted shell component here without re-checking
 * whether it actually has a route.
 */

// ─── mode type ───────────────────────────────────────────────────────────────

export type V3Mode = 'chat' | 'work' | 'code';

// ─── view route table ─────────────────────────────────────────────────────────

const VIEW_ROUTES: Record<string, string> = {
  projects: '/chat/projects',
  // In-shell artifacts live at /chat/artifacts; /gallery is the public
  // marketing-chrome gallery and drops the user outside the app shell.
  artifacts: '/chat/artifacts',
  'customize-home': '/chat/customize',
  'work-projects': '/agi-work',
  'work-artifacts': '/chat/artifacts',
  'work-dispatch': '/agi-work',
  'voice-settings': '/settings/voice',
  'general-settings': '/settings/general',
  account: '/settings/account',
  schedules: '/chat/schedules',
  'code-desktop': '/download',
  'code-vscode': '/vscode-extension',
};

export function resolveWebViewRoute(view: string): string | undefined {
  return VIEW_ROUTES[view];
}
