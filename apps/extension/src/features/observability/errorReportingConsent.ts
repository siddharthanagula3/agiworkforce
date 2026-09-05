export const ERROR_REPORTING_CONSENT_STORAGE_KEY = 'agi_error_reporting_consent';

export function parseErrorReportingConsent(stored: unknown): boolean {
  return stored === true;
}

let snapshot = false;

export function errorReportingConsentSnapshot(): boolean {
  return snapshot;
}

export function readErrorReportingConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(ERROR_REPORTING_CONSENT_STORAGE_KEY, (items) => {
        if (!chrome.runtime.lastError) {
          snapshot = parseErrorReportingConsent(items?.[ERROR_REPORTING_CONSENT_STORAGE_KEY]);
        }
        resolve(snapshot);
      });
    } catch {
      resolve(snapshot);
    }
  });
}

export function watchErrorReportingConsent(): void {
  try {
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes[ERROR_REPORTING_CONSENT_STORAGE_KEY];
      if (change) snapshot = parseErrorReportingConsent(change.newValue);
    });
  } catch {
    return;
  }
}
