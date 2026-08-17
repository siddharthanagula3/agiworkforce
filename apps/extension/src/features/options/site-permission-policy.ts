export const APPROVED_SITE_PROMPT_STORAGE_KEY = 'agi_cu_ask_before_acting';

export type ApprovedSiteDefault = 'ask' | 'run';

export const UNAPPROVED_SITE_DEFAULT_HINT =
  'Sites you have not approved are blocked: AGI runs no browser automation there and sends none of their page text to AGI Managed Cloud. Approving a site below is the only way to override that default.';

export function readApprovedSiteDefault(stored: unknown): ApprovedSiteDefault {
  return stored === false ? 'run' : 'ask';
}

export function approvedSiteDefaultToStored(value: ApprovedSiteDefault): boolean {
  return value !== 'run';
}

export function parseApprovedSiteDefault(value: unknown): ApprovedSiteDefault {
  return value === 'run' ? 'run' : 'ask';
}

export function describeApprovedSiteDefault(value: ApprovedSiteDefault): string {
  return value === 'run'
    ? 'Approved sites run without asking.'
    : 'Approved sites ask before each action.';
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
  label.textContent = 'Default site permission';

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
    ['ask', 'Approved sites: ask before each action'],
    ['run', 'Approved sites: run without asking'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = optionLabel;
    select.appendChild(option);
  }
  select.value = 'ask';
  select.disabled = true;

  element.append(text, select);

  let current: ApprovedSiteDefault = 'ask';

  const loaded = storage
    .get(APPROVED_SITE_PROMPT_STORAGE_KEY)
    .then((items) => {
      current = readApprovedSiteDefault(items[APPROVED_SITE_PROMPT_STORAGE_KEY]);
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
      .set({ [APPROVED_SITE_PROMPT_STORAGE_KEY]: approvedSiteDefaultToStored(next) })
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
