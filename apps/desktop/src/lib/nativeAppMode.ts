import { invoke } from './tauri-mock';
import { isTauri } from './runtimeEnvironment';
import { useAppModeStore, type AppMode } from '../stores/appModeStore';

let lastReport: Promise<void> = Promise.resolve();
let syncStarted = false;

async function sendAppMode(mode: AppMode): Promise<void> {
  try {
    await invoke('account_set_app_mode', { mode });
  } catch (firstError) {
    try {
      await invoke('account_set_app_mode', { mode });
    } catch {
      console.error('[app-mode] the native app mode could not be updated:', firstError);
    }
  }
}

function reportNativeAppMode(mode: AppMode): void {
  lastReport = lastReport.then(() => sendAppMode(mode));
}

export function nativeAppModeReported(): Promise<void> {
  return lastReport;
}

export function startNativeAppModeSync(): void {
  if (!isTauri || syncStarted) return;
  syncStarted = true;
  reportNativeAppMode(useAppModeStore.getState().mode);
  useAppModeStore.subscribe((state) => state.mode, reportNativeAppMode);
}
