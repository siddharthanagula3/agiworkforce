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
}

export interface DesktopChatRuntimeFactories {
  /** Local workspace runtime. Local-only and BYOK conversations both live here. */
  local: () => ChatRuntime;
  /** Managed Cloud runtime backed by the shared Web/Mobile/Desktop services. */
  managed: () => ChatRuntime;
  /** Non-Tauri embedded build runtime. */
  web: () => ChatRuntime;
}

const defaultFactories: DesktopChatRuntimeFactories = {
  local: () => new TauriRuntime(),
  managed: () => new CloudRuntime(),
  web: () => new WebRuntime(),
};

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
  if (environment.appMode === 'cloud') return factories.managed();
  return factories.local();
}
