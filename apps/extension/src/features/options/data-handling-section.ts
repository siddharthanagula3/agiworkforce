import {
  CLOUD_MIRRORING_LABEL,
  DATA_HANDLING_DISCLOSURES,
  describeCloudMirroring,
} from '../privacy/dataHandling';
import { CLOUD_MIRRORING_STORAGE_KEY, parseCloudMirroringEnabled } from '../privacy/cloudMirroring';

export interface DataHandlingStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface DataHandlingSection {
  element: HTMLElement;
  toggle: HTMLInputElement;
  status: HTMLElement;
  loaded: Promise<void>;
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

  const toggleRow = document.createElement('div');
  toggleRow.className = 'opt-row';
  const toggleText = document.createElement('div');
  const toggleLabel = document.createElement('div');
  toggleLabel.className = 'opt-row-label';
  toggleLabel.id = 'opt-cloud-mirroring-label';
  toggleLabel.textContent = CLOUD_MIRRORING_LABEL;
  const status = document.createElement('div');
  status.className = 'opt-row-hint';
  status.id = 'opt-cloud-mirroring-description';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  toggleText.append(toggleLabel, status);

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'opt-toggle';
  toggle.id = 'opt-cloud-mirroring-toggle';
  toggle.setAttribute('aria-labelledby', 'opt-cloud-mirroring-label');
  toggle.setAttribute('aria-describedby', 'opt-cloud-mirroring-description');
  toggle.checked = true;
  toggle.disabled = true;

  toggleRow.append(toggleText, toggle);
  element.appendChild(toggleRow);

  let current = true;

  const loaded = storage
    .get(CLOUD_MIRRORING_STORAGE_KEY)
    .then((items) => {
      current = parseCloudMirroringEnabled(items[CLOUD_MIRRORING_STORAGE_KEY]);
      toggle.checked = current;
      toggle.disabled = false;
      status.textContent = describeCloudMirroring(current);
    })
    .catch(() => {
      toggle.disabled = true;
      status.textContent = 'This preference could not be loaded.';
    });

  toggle.addEventListener('change', () => {
    const next = toggle.checked;
    toggle.disabled = true;
    status.textContent = 'Saving…';
    void storage
      .set({ [CLOUD_MIRRORING_STORAGE_KEY]: next })
      .then(() => {
        current = next;
        status.textContent = describeCloudMirroring(next);
      })
      .catch(() => {
        toggle.checked = current;
        status.textContent = 'Could not save this preference. Please try again.';
      })
      .finally(() => {
        toggle.disabled = false;
      });
  });

  return { element, toggle, status, loaded };
}
