import type { ChatRuntime } from '@agiworkforce/unified-chat';
import type { AppMode } from '../stores/appModeStore';
import { CloudRuntime } from './CloudRuntime';
import { TauriRuntime } from './TauriRuntime';
import { WebRuntime } from './WebRuntime';

export interface DesktopChatRuntimeEnvironment {
  isTauriHost: boolean;
  /**
   * The already-admitted workspace mode from appModeStore. This composition
   * root does not bypass authentication, entitlement, PA-3, or the streaming
   * transition lock; it only maps the state accepted by those gates to the
   * matching runtime.
   */
  appMode: AppMode;
  /** Account that owns a Managed runtime. Token refresh does not change it. */
  managedAccountId?: string | null;
  /** Server/tier projection for the Deep Research composer capability. */
  managedResearchEnabled?: boolean;
}

export interface DesktopChatRuntimeFactories {
  /** Local workspace runtime. Local-only and BYOK conversations both live here. */
  local: () => ChatRuntime;
  /** Managed Cloud runtime backed by the shared Web/Mobile/Desktop services. */
  managed: (expectedAccountId?: string | null, researchEnabled?: boolean) => ChatRuntime;
  /** Non-Tauri embedded build runtime. */
  web: () => ChatRuntime;
}

const defaultFactories: DesktopChatRuntimeFactories = {
  local: () => new TauriRuntime(),
  managed: (expectedAccountId, researchEnabled = false) =>
    new CloudRuntime(expectedAccountId, researchEnabled),
  web: () => new WebRuntime(),
};

let activeDesktopChatRuntime: ChatRuntime | null = null;

/**
 * Registers the runtime mounted by the Desktop composition root.
 *
 * Keeping lifecycle ownership next to runtime selection lets auth teardown
 * dispose the exact managed runtime before its credential is revoked. The
 * shared ChatRuntime.dispose contract keeps the same seam reusable by other
 * hosts without coupling auth code to CloudRuntime internals.
 */
export function registerActiveDesktopChatRuntime(runtime: ChatRuntime): () => void {
  if (activeDesktopChatRuntime && activeDesktopChatRuntime !== runtime) {
    void activeDesktopChatRuntime.dispose?.();
  }
  activeDesktopChatRuntime = runtime;

  return () => {
    if (activeDesktopChatRuntime !== runtime) return;
    activeDesktopChatRuntime = null;
    // React Strict Mode replays effect setup/cleanup with the SAME memoized
    // runtime. Defer disposal one microtask: a replay re-registers that exact
    // instance synchronously, while a real replacement/unmount leaves another
    // instance (or null) active and safely disposes this one.
    queueMicrotask(() => {
      if (activeDesktopChatRuntime !== runtime) {
        void runtime.dispose?.();
      }
    });
  };
}

export async function disposeActiveDesktopChatRuntime(): Promise<void> {
  const runtime = activeDesktopChatRuntime;
  activeDesktopChatRuntime = null;
  await runtime?.dispose?.();
}

/**
 * The sole Desktop chat-runtime composition root.
 *
 * Local and BYOK never instantiate CloudRuntime. Managed Cloud is selected
 * only when a Tauri host's existing mode gate has admitted the exact `cloud`
 * value. Any unreadable value fails closed to the local Tauri runtime. The
 * embedded non-Tauri build remains on WebRuntime.
 */
export function createDesktopChatRuntime(
  environment: DesktopChatRuntimeEnvironment,
  factories: DesktopChatRuntimeFactories = defaultFactories,
): ChatRuntime {
  if (!environment.isTauriHost) return factories.web();
  if (environment.appMode === 'cloud') {
    return factories.managed(environment.managedAccountId, environment.managedResearchEnabled);
  }
  return factories.local();
}
