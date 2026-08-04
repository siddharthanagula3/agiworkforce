/**
 * Electron replacement for `@tauri-apps/plugin-updater`.
 *
 * Auto-update for the Electron shell is deliberately deferred (electron-updater
 * over a `latest-mac.yml` feed is planned; see PLAN.md). Until then this
 * honestly reports no in-app updates — users get new versions from the
 * download page rather than a silently dead updater.
 */
export async function check(): Promise<{ available: boolean }> {
  return { available: false };
}
