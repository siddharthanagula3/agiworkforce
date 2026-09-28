import { MANAGED_CLOUD_APPROVAL_HISTORY_PATH } from '@agiworkforce/cloud-contracts';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';

export interface ApprovalHistoryEntry {
  id: string;
  toolName: string;
  decision: 'approved' | 'rejected';
  conversationId: string | null;
  createdAt: string;
}

export interface ApprovalHistoryDependencies {
  gateway: string;
  getAuthToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  headers?: () => Record<string, string>;
  openTab: (url: string) => void;
}

export interface ApprovalHistorySection {
  element: HTMLElement;
  loaded: Promise<void>;
}

const PAGE_SIZE = 20;

function readEntry(value: unknown): ApprovalHistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { id, toolName, decision, conversationId, createdAt } = record;
  if (
    typeof id !== 'string' ||
    typeof toolName !== 'string' ||
    (decision !== 'approved' && decision !== 'rejected') ||
    (conversationId !== null && typeof conversationId !== 'string') ||
    typeof createdAt !== 'string'
  ) {
    return null;
  }
  return { id, toolName, decision, conversationId, createdAt };
}

export function parseApprovalHistory(body: unknown): ApprovalHistoryEntry[] {
  const approvals = (body as { approvals?: unknown } | null)?.approvals;
  if (!Array.isArray(approvals)) throw new Error('The approval history answer was malformed.');
  return approvals.flatMap((entry) => {
    const parsed = readEntry(entry);
    return parsed ? [parsed] : [];
  });
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : value;
}

export function createApprovalHistorySection(
  deps: ApprovalHistoryDependencies,
): ApprovalHistorySection {
  const element = document.createElement('div');
  element.className = 'opt-approval-history';
  element.setAttribute('aria-labelledby', 'opt-approval-history-label');

  const label = document.createElement('div');
  label.className = 'opt-row-label';
  label.id = 'opt-approval-history-label';
  label.textContent = 'Approval history';

  const hint = document.createElement('div');
  hint.className = 'opt-row-hint';
  hint.textContent = 'Tool requests you allowed or denied in chats on every device, newest first.';

  const status = document.createElement('div');
  status.className = 'opt-row-hint';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const list = document.createElement('ul');
  list.className = 'opt-approval-history-list';
  list.setAttribute('aria-labelledby', label.id);
  list.hidden = true;

  const pager = document.createElement('div');
  pager.className = 'opt-approval-history-pager';
  pager.hidden = true;
  const newer = document.createElement('button');
  newer.type = 'button';
  newer.className = 'opt-btn-secondary';
  newer.textContent = 'Newer';
  const older = document.createElement('button');
  older.type = 'button';
  older.className = 'opt-btn-secondary';
  older.textContent = 'Older';
  pager.append(newer, older);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'opt-btn-secondary';
  retry.textContent = 'Try again';
  retry.hidden = true;

  element.append(label, hint, status, list, pager, retry);

  let offset = 0;
  let generation = 0;

  const renderEntries = (entries: readonly ApprovalHistoryEntry[]): void => {
    list.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement('li');
        item.className = 'opt-approval-history-item';
        const summary = document.createElement('div');
        summary.className = 'opt-approval-history-summary';
        const verdict = document.createElement('span');
        verdict.className = `opt-approval-history-decision opt-approval-history-decision--${entry.decision}`;
        verdict.textContent =
          entry.decision === 'approved'
            ? TOOL_APPROVAL_ACTION_LABELS.allowed
            : TOOL_APPROVAL_ACTION_LABELS.denied;
        const tool = document.createElement('span');
        tool.className = 'opt-approval-history-tool';
        tool.textContent = entry.toolName;
        summary.append(verdict, tool);
        const time = document.createElement('time');
        time.className = 'opt-row-hint';
        time.dateTime = entry.createdAt;
        time.textContent = formatTimestamp(entry.createdAt);
        item.append(summary, time);
        const conversationId = entry.conversationId;
        if (conversationId) {
          const open = document.createElement('button');
          open.type = 'button';
          open.className = 'opt-approval-history-open';
          open.textContent = 'Open chat';
          open.setAttribute('aria-label', `Open the chat where ${entry.toolName} was decided`);
          open.addEventListener('click', () =>
            deps.openTab(
              `${deps.gateway}/chat/${encodeURIComponent(conversationId)}?from=chrome-extension`,
            ),
          );
          item.appendChild(open);
        }
        return item;
      }),
    );
  };

  const load = async (): Promise<void> => {
    const run = ++generation;
    list.setAttribute('aria-busy', 'true');
    retry.hidden = true;
    newer.disabled = true;
    older.disabled = true;
    status.textContent = 'Loading approval history…';
    try {
      const token = await deps.getAuthToken();
      if (run !== generation) return;
      if (!token) {
        list.hidden = true;
        pager.hidden = true;
        status.textContent = 'Sign in to see the approvals you decided on every device.';
        return;
      }
      const params = new URLSearchParams({ limit: String(PAGE_SIZE + 1), offset: String(offset) });
      const response = await (deps.fetchImpl ?? fetch)(
        `${deps.gateway}${MANAGED_CLOUD_APPROVAL_HISTORY_PATH}?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}`, ...(deps.headers?.() ?? {}) } },
      );
      if (!response.ok) throw new Error(`AGI Workforce answered HTTP ${response.status}.`);
      const entries = parseApprovalHistory(await response.json());
      if (run !== generation) return;
      renderEntries(entries.slice(0, PAGE_SIZE));
      list.hidden = entries.length === 0;
      const hasMore = entries.length > PAGE_SIZE;
      pager.hidden = offset === 0 && !hasMore;
      newer.disabled = offset === 0;
      older.disabled = !hasMore;
      status.textContent =
        entries.length > 0 ? '' : offset === 0 ? 'No tool approvals yet.' : 'No older approvals.';
    } catch (error) {
      if (run !== generation) return;
      list.hidden = true;
      pager.hidden = true;
      retry.hidden = false;
      status.textContent =
        `Approval history could not load. ${error instanceof Error ? error.message : ''}`.trim();
    } finally {
      if (run === generation) list.removeAttribute('aria-busy');
    }
  };

  newer.addEventListener('click', () => {
    offset = Math.max(0, offset - PAGE_SIZE);
    void load();
  });
  older.addEventListener('click', () => {
    offset += PAGE_SIZE;
    void load();
  });
  retry.addEventListener('click', () => void load());

  return { element, loaded: load() };
}
