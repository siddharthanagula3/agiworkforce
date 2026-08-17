export const CLOUD_MIRRORING_STORAGE_KEY = 'agi_cloud_conversation_mirroring';

export function parseCloudMirroringEnabled(stored: unknown): boolean {
  return stored !== false;
}

let snapshot = true;

export function cloudMirroringEnabledSnapshot(): boolean {
  return snapshot;
}

export function readCloudMirroringEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(CLOUD_MIRRORING_STORAGE_KEY, (items) => {
        if (!chrome.runtime.lastError) {
          snapshot = parseCloudMirroringEnabled(items?.[CLOUD_MIRRORING_STORAGE_KEY]);
        }
        resolve(snapshot);
      });
    } catch {
      resolve(snapshot);
    }
  });
}

export function watchCloudMirroringEnabled(): void {
  try {
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes[CLOUD_MIRRORING_STORAGE_KEY];
      if (change) snapshot = parseCloudMirroringEnabled(change.newValue);
    });
  } catch {
    // chrome.storage.onChanged is unavailable outside the extension runtime.
  }
}
