import type { ChatRuntime } from '@agiworkforce/unified-chat';
import type { AppMode } from '../stores/appModeStore';
import { CloudRuntime } from './CloudRuntime';
import { TauriRuntime } from './TauriRuntime';
import { WebRuntime } from './WebRuntime';

export interface DesktopChatRuntimeEnvironment {
  isTauriHost: boolean;
  appMode: AppMode;
  managedAccountId?: string | null;
  managedResearchEnabled?: boolean;
}

export interface DesktopChatRuntimeFactories {
  local: () => ChatRuntime;
  managed: (expectedAccountId?: string | null, researchEnabled?: boolean) => ChatRuntime;
  web: () => ChatRuntime;
}

const defaultFactories: DesktopChatRuntimeFactories = {
  local: () => new TauriRuntime(),
  managed: (expectedAccountId, researchEnabled = false) =>
    new CloudRuntime(expectedAccountId, researchEnabled),
  web: () => new WebRuntime(),
};

let activeDesktopChatRuntime: ChatRuntime | null = null;

export function registerActiveDesktopChatRuntime(runtime: ChatRuntime): () => void {
  if (activeDesktopChatRuntime && activeDesktopChatRuntime !== runtime) {
    void activeDesktopChatRuntime.dispose?.();
  }
  activeDesktopChatRuntime = runtime;

  return () => {
    if (activeDesktopChatRuntime !== runtime) return;
    activeDesktopChatRuntime = null;
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
