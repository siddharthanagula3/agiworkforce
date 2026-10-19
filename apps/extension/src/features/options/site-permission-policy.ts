import {
  ASK_BEFORE_ACTING_KEY,
  browserPermissionModeToStored,
  readBrowserPermissionMode,
  type BrowserPermissionMode,
} from '../computer-use/askBeforeActing';

export type ApprovedSiteDefault = BrowserPermissionMode;

export const UNAPPROVED_SITE_DEFAULT_HINT =
  'Auto is the default: AGI acts on the sites a task needs and asks before it buys or pays, sends or posts, submits personal details, deletes, enters credentials, accepts terms, grants access or downloads. Sites you have not approved are blocked until you allow one for a task, and the in-page assistant and page tools run on approved sites only. Full access runs every action on approved sites without asking.';

export function readApprovedSiteDefault(stored: unknown): ApprovedSiteDefault {
  return readBrowserPermissionMode(stored);
}

export function approvedSiteDefaultToStored(value: ApprovedSiteDefault): boolean | string {
  return browserPermissionModeToStored(value);
}

export function parseApprovedSiteDefault(value: unknown): ApprovedSiteDefault {
  return value === 'ask' || value === 'full' ? value : 'auto';
}

export function describeApprovedSiteDefault(value: ApprovedSiteDefault): string {
  if (value === 'ask') return 'AGI asks before each action.';
  if (value === 'full') return 'Approved sites run without asking.';
  return 'AGI acts and asks only before crucial actions.';
}

export interface SitePermissionPolicyStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface SitePermissionPolicySection {
  element: HTMLElement;
  select: HTMLSelectElement;
  status: HTMLElement;
  loaded: Promise<void>;
}

export function createSitePermissionPolicySection(
  storage: SitePermissionPolicyStorage,
): SitePermissionPolicySection {
  const element = document.createElement('div');
  element.className = 'opt-row';

  const text = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'opt-row-label';
  label.id = 'opt-site-policy-label';
  label.textContent = 'Browser control';

  const hint = document.createElement('div');
  hint.className = 'opt-row-hint';
  hint.id = 'opt-site-policy-description';
  hint.textContent = UNAPPROVED_SITE_DEFAULT_HINT;

  const status = document.createElement('div');
  status.className = 'opt-row-hint';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  text.append(label, hint, status);

  const select = document.createElement('select');
  select.className = 'opt-policy-select';
  select.id = 'opt-site-policy-select';
  select.setAttribute('aria-labelledby', 'opt-site-policy-label');
  select.setAttribute('aria-describedby', 'opt-site-policy-description');
  for (const [value, optionLabel] of [
    ['auto', 'Auto: ask only before crucial actions'],
    ['ask', 'Ask before each action'],
    ['full', 'Approved sites: run without asking'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = optionLabel;
    select.appendChild(option);
  }
  select.value = 'auto';
  select.disabled = true;

  element.append(text, select);

  let current: ApprovedSiteDefault = 'auto';

  const loaded = storage
    .get(ASK_BEFORE_ACTING_KEY)
    .then((items) => {
      current = readApprovedSiteDefault(items[ASK_BEFORE_ACTING_KEY]);
      select.value = current;
      select.disabled = false;
      status.textContent = describeApprovedSiteDefault(current);
    })
    .catch(() => {
      select.disabled = true;
      status.textContent = 'Default site permission could not be loaded.';
    });

  select.addEventListener('change', () => {
    const next = parseApprovedSiteDefault(select.value);
    const previous = current;
    select.disabled = true;
    status.textContent = 'Saving…';
    void storage
      .set({ [ASK_BEFORE_ACTING_KEY]: approvedSiteDefaultToStored(next) })
      .then(() => {
        current = next;
        status.textContent = describeApprovedSiteDefault(next);
      })
      .catch(() => {
        select.value = previous;
        status.textContent = 'Could not save the default site permission. Please try again.';
      })
      .finally(() => {
        select.disabled = false;
      });
  });

  return { element, select, status, loaded };
}
