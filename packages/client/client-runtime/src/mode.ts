/**
 * Client app-mode contract (Local vs Cloud) for shared UI.
 *
 * The Local/Cloud choice is a trust boundary, so packages that render on more
 * than one host must not each hand-parse the desktop store's persisted
 * payload. `resolveClientChatExecutionMode` is the single reader published to
 * them; everything it needs stays private to this module.
 *
 * This is the reader side only. `apps/desktop/src/stores/appModeStore.ts`
 * still owns the key and writes it, and it declares the literal itself — a
 * rename there is NOT caught by the compiler, it is caught by the
 * desktop-shell fallback below resolving Local anyway.
 */
import type { ChatExecutionMode } from '@agiworkforce/types';

type ClientAppMode = 'local' | 'cloud';

/** localStorage key the desktop app-mode store persists under. */
const APP_MODE_STORAGE_KEY = 'app-mode-store';

/**
 * True when this bundle is running inside the Tauri desktop shell.
 *
 * `detect.ts` snapshots the same globals into a module-level const evaluated
 * at import time; this re-reads them on every call so a host that mounts
 * shared UI before the shell has finished injecting them still resolves.
 */
function inDesktopShell(): boolean {
  return (
    typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

/** The persisted mode, or `null` when nothing readable has been written yet. */
function readPersistedClientAppMode(): ClientAppMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(APP_MODE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { mode?: unknown } };
    const mode = parsed.state?.mode;
    return mode === 'local' || mode === 'cloud' ? mode : null;
  } catch {
    return null;
  }
}

/**
 * The mode this client is in, resolved for readers that have no host-supplied
 * answer.
 *
 * The entry can be missing or unreadable: zustand `persist` lazy-writes (a
 * session that never touched a setter writes nothing until
 * `appModeStore.ts`'s priming `setState` runs), the write can throw under a
 * storage quota or a locked-down profile, and a payload from an older schema
 * parses without a usable `mode`. Desktop starts in Local, so no readable
 * entry inside the shell means Local: answering Cloud would show the
 * managed-cloud catalog and its label to a Local workspace. A browser has no
 * Local runtime, so the same silence there really is Cloud.
 *
 * Scope: this decides the label and which catalog the picker offers. Egress is
 * enforced separately at the send path — a wrong answer here misinforms, it
 * does not by itself move data across the boundary.
 */
function resolveClientAppMode(): ClientAppMode {
  return readPersistedClientAppMode() ?? (inDesktopShell() ? 'local' : 'cloud');
}

/** The above as the chat trust boundary the shared chat UI admits models for. */
export function resolveClientChatExecutionMode(): ChatExecutionMode {
  return resolveClientAppMode() === 'local' ? 'local_only' : 'cloud_managed';
}
