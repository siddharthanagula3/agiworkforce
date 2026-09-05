/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const _store: Record<string, unknown> = {};

function selectedValues(
  key: string | string[] | Record<string, unknown> | null,
): Record<string, unknown> {
  if (key === null) return { ..._store };
  if (typeof key === 'object' && !Array.isArray(key)) {
    return Object.fromEntries(
      Object.entries(key).map(([name, fallback]) => [
        name,
        name in _store ? _store[name] : fallback,
      ]),
    );
  }
  const keys = Array.isArray(key) ? key : [key];
  return Object.fromEntries(keys.map((entry) => [entry, _store[entry]]));
}

type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  area: string,
) => void;

const changeListeners: StorageChangeListener[] = [];

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(
        (
          key: string | string[] | Record<string, unknown> | null,
          cb?: (res: Record<string, unknown>) => void,
        ) => (cb ? cb(selectedValues(key)) : Promise.resolve(selectedValues(key))),
      ),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        const changes: Record<string, { newValue?: unknown; oldValue?: unknown }> = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: _store[k], newValue: v };
          _store[k] = v;
        }
        for (const listener of changeListeners) listener(changes, 'local');
        if (cb) {
          cb();
          return undefined;
        }
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: (listener: StorageChangeListener) => {
        changeListeners.push(listener);
      },
    },
  },
  runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
};
(globalThis as unknown as Record<string, unknown>).chrome = chromeMock;

import {
  ERROR_REPORTING_CONSENT_STORAGE_KEY,
  errorReportingConsentSnapshot,
  parseErrorReportingConsent,
  readErrorReportingConsent,
  watchErrorReportingConsent,
} from '../src/features/observability/errorReportingConsent';
import { createDataHandlingSection } from '../src/features/options/data-handling-section';

watchErrorReportingConsent();

beforeEach(async () => {
  for (const key of Object.keys(_store)) delete _store[key];
  chromeMock.runtime.lastError = undefined;
  await readErrorReportingConsent();
});

describe('error reporting consent', () => {
  it('defaults to off for anything other than an explicit true', () => {
    expect(parseErrorReportingConsent(undefined)).toBe(false);
    expect(parseErrorReportingConsent(false)).toBe(false);
    expect(parseErrorReportingConsent('true')).toBe(false);
    expect(parseErrorReportingConsent(true)).toBe(true);
  });

  it('starts the runtime snapshot off before any preference is stored', async () => {
    expect(await readErrorReportingConsent()).toBe(false);
    expect(errorReportingConsentSnapshot()).toBe(false);
  });

  it('flips the snapshot once the user opts in', async () => {
    _store[ERROR_REPORTING_CONSENT_STORAGE_KEY] = true;
    expect(await readErrorReportingConsent()).toBe(true);
    expect(errorReportingConsentSnapshot()).toBe(true);
  });

  it('reacts to a storage change from the options page without a manual reload', () => {
    chromeMock.storage.local.set({ [ERROR_REPORTING_CONSENT_STORAGE_KEY]: true });
    expect(errorReportingConsentSnapshot()).toBe(true);

    chromeMock.storage.local.set({ [ERROR_REPORTING_CONSENT_STORAGE_KEY]: false });
    expect(errorReportingConsentSnapshot()).toBe(false);
  });
});

describe('error reporting consent toggle on the options page', () => {
  it('renders off by default and persists an opt-in', async () => {
    const section = createDataHandlingSection({
      get: (key) => chromeMock.storage.local.get(key) as Promise<Record<string, unknown>>,
      set: (items) => chromeMock.storage.local.set(items) as Promise<void>,
    });
    await section.loaded;

    expect(section.element.textContent).toContain('Share crash and usage telemetry');
    expect(section.errorReportingToggle.checked).toBe(false);

    section.errorReportingToggle.checked = true;
    section.errorReportingToggle.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    expect(_store[ERROR_REPORTING_CONSENT_STORAGE_KEY]).toBe(true);
    expect(section.errorReportingStatus.textContent).toContain('Crash reports are sent');
  });

  it('is mounted alongside the other privacy toggle, not a separate section', () => {
    const section = createDataHandlingSection({
      get: (key) => chromeMock.storage.local.get(key) as Promise<Record<string, unknown>>,
      set: (items) => chromeMock.storage.local.set(items) as Promise<void>,
    });
    expect(section.element.id).toBe('opt-privacy');
    expect(section.element.querySelectorAll('.opt-section-title')).toHaveLength(1);
  });
});
