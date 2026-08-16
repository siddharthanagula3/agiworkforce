import type { ChatExecutionMode } from '@agiworkforce/types';

type ClientAppMode = 'local' | 'cloud';

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

function resolveClientAppMode(): ClientAppMode {
  return readPersistedClientAppMode() ?? (inDesktopShell() ? 'local' : 'cloud');
}

export function resolveClientChatExecutionMode(): ChatExecutionMode {
  return resolveClientAppMode() === 'local' ? 'local_only' : 'cloud_managed';
}
