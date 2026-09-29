import {
  CLOUD_MIRRORING_LABEL,
  DATA_HANDLING_DISCLOSURES,
  describeCloudMirroring,
} from '../privacy/dataHandling';
import { CLOUD_MIRRORING_STORAGE_KEY, parseCloudMirroringEnabled } from '../privacy/cloudMirroring';
import {
  ERROR_REPORTING_CONSENT_STORAGE_KEY,
  parseErrorReportingConsent,
} from '../observability/errorReportingConsent';
import {
  ERROR_REPORTING_CONSENT_LABEL,
  describeErrorReportingConsent,
} from '../observability/errorReportingCopy';

export interface DataHandlingStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface DataHandlingSection {
  element: HTMLElement;
  toggle: HTMLInputElement;
  status: HTMLElement;
  errorReportingToggle: HTMLInputElement;
  errorReportingStatus: HTMLElement;
  loaded: Promise<void>;
}

interface ToggleRowConfig {
  idPrefix: string;
  label: string;
  storageKey: string;
  defaultChecked: boolean;
  parse(stored: unknown): boolean;
  describe(enabled: boolean): string;
  loadFailureMessage: string;
  saveFailureMessage: string;
}

interface ToggleRow {
  row: HTMLElement;
  toggle: HTMLInputElement;
  status: HTMLElement;
  loaded: Promise<void>;
}

const SAVING_STATUS_TEXT = 'Saving…';
const LOAD_FAILURE_TEXT = 'This preference could not be loaded.';
const SAVE_FAILURE_TEXT = 'Could not save this preference. Please try again.';

function buildToggleRow(storage: DataHandlingStorage, config: ToggleRowConfig): ToggleRow {
  const row = document.createElement('div');
  row.className = 'opt-row';

  const text = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'opt-row-label';
  label.id = `${config.idPrefix}-label`;
  label.textContent = config.label;

  const status = document.createElement('div');
  status.className = 'opt-row-hint';
  status.id = `${config.idPrefix}-description`;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  text.append(label, status);

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'opt-toggle';
  toggle.id = `${config.idPrefix}-toggle`;
  toggle.setAttribute('aria-labelledby', label.id);
  toggle.setAttribute('aria-describedby', status.id);
  toggle.checked = config.defaultChecked;
  toggle.disabled = true;

  row.append(text, toggle);

  let current = config.defaultChecked;

  const loaded = storage
    .get(config.storageKey)
    .then((items) => {
      current = config.parse(items[config.storageKey]);
      toggle.checked = current;
      toggle.disabled = false;
      status.textContent = config.describe(current);
    })
    .catch(() => {
      toggle.disabled = true;
      status.textContent = config.loadFailureMessage;
    });

  toggle.addEventListener('change', () => {
    const next = toggle.checked;
    toggle.disabled = true;
    status.textContent = SAVING_STATUS_TEXT;
    void storage
      .set({ [config.storageKey]: next })
      .then(() => {
        current = next;
        status.textContent = config.describe(next);
      })
      .catch(() => {
        toggle.checked = current;
        status.textContent = config.saveFailureMessage;
      })
      .finally(() => {
        toggle.disabled = false;
      });
  });

  return { row, toggle, status, loaded };
}

export function createDataHandlingSection(storage: DataHandlingStorage): DataHandlingSection {
  const element = document.createElement('section');
  element.className = 'opt-section';
  element.id = 'opt-privacy';

  const header = document.createElement('div');
  header.className = 'opt-section-header';
  const title = document.createElement('h2');
  title.className = 'opt-section-title';
  title.textContent = 'Privacy and data handling';
  header.appendChild(title);
  element.appendChild(header);

  for (const disclosure of DATA_HANDLING_DISCLOSURES) {
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.dataset['disclosure'] = disclosure.id;
    const text = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'opt-row-label';
    label.textContent = disclosure.label;
    const body = document.createElement('div');
    body.className = 'opt-row-hint';
    body.textContent = disclosure.body;
    text.append(label, body);
    row.appendChild(text);
    element.appendChild(row);
  }

  const cloudMirroring = buildToggleRow(storage, {
    idPrefix: 'opt-cloud-mirroring',
    label: CLOUD_MIRRORING_LABEL,
    storageKey: CLOUD_MIRRORING_STORAGE_KEY,
    defaultChecked: true,
    parse: parseCloudMirroringEnabled,
    describe: describeCloudMirroring,
    loadFailureMessage: LOAD_FAILURE_TEXT,
    saveFailureMessage: SAVE_FAILURE_TEXT,
  });
  element.appendChild(cloudMirroring.row);

  const errorReporting = buildToggleRow(storage, {
    idPrefix: 'opt-error-reporting',
    label: ERROR_REPORTING_CONSENT_LABEL,
    storageKey: ERROR_REPORTING_CONSENT_STORAGE_KEY,
    defaultChecked: false,
    parse: parseErrorReportingConsent,
    describe: describeErrorReportingConsent,
    loadFailureMessage: LOAD_FAILURE_TEXT,
    saveFailureMessage: SAVE_FAILURE_TEXT,
  });
  element.appendChild(errorReporting.row);

  const loaded = Promise.all([cloudMirroring.loaded, errorReporting.loaded]).then(() => undefined);

  return {
    element,
    toggle: cloudMirroring.toggle,
    status: cloudMirroring.status,
    errorReportingToggle: errorReporting.toggle,
    errorReportingStatus: errorReporting.status,
    loaded,
  };
}
