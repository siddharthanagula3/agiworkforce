'use client';

import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Spinner, useConfirmAction, type ConfirmActionRequest } from '@agiworkforce/ui';
import { isPluginRegistryStatus, type PluginRegistryStatus } from '@agiworkforce/types';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import type {
  PluginLifecycleAction,
  PluginLifecycleEvent,
  PluginRollbackResult,
  PluginVersionRecord,
} from '@/lib/services/plugin-lifecycle';
import type { PluginModerationEntry } from '@/lib/services/plugin-registry-service';
import {
  ADMIN_PLUGIN_SUBMISSIONS_PATH,
  PLUGIN_SUBMISSION_REVIEW_STATUS_PARAM,
  type PluginSubmissionDecision,
  type PluginSubmissionReview,
  type PluginSubmissionReviewListResponse,
  type PluginSubmissionReviewResponse,
  type PluginSubmissionStatus,
} from '@agiworkforce/cloud-contracts';
import { formatDateTime } from '../lib/operator-format';

const LIST_ENDPOINT = '/api/admin/plugins';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40 pointer-coarse:min-h-11';
const ACTION_CLASS =
  'shrink-0 rounded-full border border-border px-4 py-2 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50 pointer-coarse:min-h-11';
const DESTRUCTIVE_CLASS =
  'shrink-0 rounded-full border border-destructive/50 px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-destructive/10 disabled:opacity-50 pointer-coarse:min-h-11';
const BADGE_CLASS = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-border text-muted-foreground',
  info: 'border-info-fill/30 bg-info-fill/10 text-info-text',
  success: 'border-success-fill/30 bg-success-fill/10 text-success-text',
  warning: 'border-warning-fill/30 bg-warning-fill/10 text-warning-text',
  danger: 'border-danger-fill/30 bg-danger-fill/10 text-danger-text',
};

interface StatusView {
  label: string;
  tone: Tone;
}

const STATUS_VIEW: Record<PluginRegistryStatus, StatusView> = {
  draft: { label: 'Draft', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'info' },
  preview: { label: 'Preview', tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  deprecated: { label: 'Deprecated', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'danger' },
};

const EVENT_TITLE: Record<PluginLifecycleAction, (version: string) => string> = {
  submit: (version) => `Submitted ${version} for review`,
  publish: (version) => `Published ${version}`,
  deprecate: (version) => `Deprecated ${version}`,
  suspend: (version) => `Suspended ${version}`,
  restore: (version) => `Restored ${version}`,
  rollback: (version) => `Rolled back to ${version}`,
};

type ReasonAction = 'deprecate' | 'suspend';

const REASON_ACTION_COPY: Record<ReasonAction, { label: string; working: string }> = {
  deprecate: { label: 'Deprecate', working: 'Deprecating…' },
  suspend: { label: 'Suspend', working: 'Suspending…' },
};

interface PluginListResponse {
  plugins: PluginModerationEntry[];
  total: number;
}

interface LifecycleView {
  versions: PluginVersionRecord[];
  events: PluginLifecycleEvent[];
}

interface VersionResult {
  version: PluginVersionRecord;
}

interface SuspendResult extends VersionResult {
  installationsStopped: number;
}

type LifecyclePayload =
  | { action: 'publish'; version: string }
  | { action: ReasonAction; version: string; reason: string }
  | { action: 'rollback' };

interface ReasonDraft {
  action: ReasonAction;
  version: string;
  reason: string;
}

interface PendingAction {
  action: LifecyclePayload['action'];
  version: string | null;
}

interface ActionFailure {
  version: string | null;
  message: string;
}

function apiErrorMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return null;
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'include', ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(apiErrorMessage(body) ?? `HTTP ${response.status}`), {
      status: response.status,
    });
  }
  return body as T;
}

function listUrl(search: string): string {
  return search ? `${LIST_ENDPOINT}?q=${encodeURIComponent(search)}` : LIST_ENDPOINT;
}

function lifecycleUrl(pluginId: string): string {
  return `/api/plugins/${encodeURIComponent(pluginId)}/lifecycle`;
}

function statusView(status: string): StatusView {
  return isPluginRegistryStatus(status) ? STATUS_VIEW[status] : { label: status, tone: 'neutral' };
}

function StatusBadge({ status }: { status: string }) {
  const view = statusView(status);
  return <span className={`${BADGE_CLASS} ${TONE_CLASS[view.tone]}`}>{view.label}</span>;
}

function LoadingLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <Spinner size="sm" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function installations(count: number): string {
  return `${count} ${count === 1 ? 'installation' : 'installations'}`;
}

function statusChange(event: PluginLifecycleEvent): string {
  if (event.action === 'rollback') return `From ${event.fromStatus ?? 'no pinned version'}`;
  const to = statusView(event.toStatus).label.toLowerCase();
  return event.fromStatus ? `${statusView(event.fromStatus).label} to ${to}` : `Created as ${to}`;
}

function rollbackTarget(
  versions: readonly PluginVersionRecord[],
  current: string,
): PluginVersionRecord | null {
  let target: PluginVersionRecord | null = null;
  for (const candidate of versions) {
    if (candidate.status !== 'published' || candidate.version === current) continue;
    if (!candidate.publishedAt) continue;
    if (!target?.publishedAt || candidate.publishedAt > target.publishedAt) target = candidate;
  }
  return target;
}

function PluginReviewPanel({
  panelId,
  plugin,
  confirm,
  onChanged,
}: {
  panelId: string;
  plugin: PluginModerationEntry;
  confirm: (request: ConfirmActionRequest) => void;
  onChanged: () => Promise<void>;
}) {
  const [view, setView] = useState<LifecycleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReasonDraft | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const latestLoad = useRef(0);
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const draftOpener = useRef<HTMLButtonElement | null>(null);
  const draftKey = draft ? `${draft.action}:${draft.version}` : null;

  const load = useCallback(async () => {
    const request = latestLoad.current + 1;
    latestLoad.current = request;
    try {
      const body = await readJson<LifecycleView>(lifecycleUrl(plugin.id));
      if (request !== latestLoad.current) return;
      setView(body);
      setLoadError(null);
    } catch (loadFailure) {
      if (request !== latestLoad.current) return;
      setLoadError(toUserMessage(loadFailure, 'The versions and history could not be loaded.'));
    } finally {
      if (request === latestLoad.current) setLoading(false);
    }
  }, [plugin.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (draftKey) reasonField.current?.focus();
  }, [draftKey]);

  const busy = pending !== null;

  function isPending(action: LifecyclePayload['action'], version: string | null): boolean {
    return pending?.action === action && pending.version === version;
  }

  async function run<T>(
    payload: LifecyclePayload,
    describe: (result: T) => string,
    fallback: string,
  ): Promise<void> {
    const version = 'version' in payload ? payload.version : null;
    setPending({ action: payload.action, version });
    setFailure(null);
    setNotice(null);
    try {
      const result = await readJson<T>(lifecycleUrl(plugin.id), {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      setDraft(null);
      setNotice(describe(result));
      await Promise.all([load(), onChanged()]);
    } catch (actionError) {
      setFailure({ version, message: toUserMessage(actionError, fallback) });
    } finally {
      setPending(null);
    }
  }

  function publish(version: string) {
    void run<VersionResult>(
      { action: 'publish', version },
      (result) => `Published ${result.version.version}. New installs get this version.`,
      'The version was not published.',
    );
  }

  function openDraft(action: ReasonAction, version: string, opener: HTMLButtonElement) {
    draftOpener.current = opener;
    setFailure(null);
    setDraft((current) =>
      current?.action === action && current.version === version
        ? current
        : { action, version, reason: '' },
    );
  }

  function closeDraft() {
    setDraft(null);
    setFailure(null);
    draftOpener.current?.focus();
  }

  function consequence(action: ReasonAction, version: string): string {
    const stopsNewInstalls =
      version === plugin.version
        ? ' It is the current version, so new installs stop until you publish another version or roll back.'
        : '';
    return action === 'suspend'
      ? `Installations on ${version} stop running it until they update to another published version.${stopsNewInstalls}`
      : `Installations on ${version} keep running it, and the plugin page tells people not to install it.${stopsNewInstalls}`;
  }

  function submitDraft(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const { action, version } = draft;
    const reason = draft.reason.trim();
    if (!reason) {
      setFailure({
        version,
        message: 'Give a reason. It is shown on the plugin page and recorded in the audit log.',
      });
      return;
    }
    if (action === 'deprecate') {
      void run<VersionResult>(
        { action, version, reason },
        (result) => `Deprecated ${result.version.version}.`,
        'The version was not deprecated.',
      );
      return;
    }
    confirm({
      title: `Suspend ${plugin.name} ${version}?`,
      description: `${consequence('suspend', version)} The reason is shown on the plugin page, and your account and the time are recorded in the plugin history and the security audit log.`,
      confirmLabel: 'Suspend',
      onConfirm: () =>
        run<SuspendResult>(
          { action, version, reason },
          (result) =>
            `Suspended ${result.version.version}. ${installations(result.installationsStopped)} stopped running it.`,
          'The version was not suspended.',
        ),
    });
  }

  function rollBack(target: PluginVersionRecord, currentSuspended: boolean) {
    confirm({
      title: `Roll back ${plugin.name} to ${target.version}?`,
      description:
        `Installations on ${plugin.version} move back to ${target.version}, the previous published version, and new installs get ${target.version}. ` +
        (currentSuspended
          ? `Installations the suspension of ${plugin.version} stopped stay off until their owners turn them back on. `
          : '') +
        'Your account and the time are recorded in the plugin history and the security audit log.',
      confirmLabel: 'Roll back',
      onConfirm: () =>
        run<PluginRollbackResult>(
          { action: 'rollback' },
          (result) =>
            `Rolled back to ${result.restored.version}. ${installations(result.installationsMoved)} moved from ${result.from ?? 'the previous version'}.`,
          'The plugin was not rolled back.',
        ),
    });
  }

  const target = view ? rollbackTarget(view.versions, plugin.version) : null;
  const currentSuspended =
    view?.versions.find((version) => version.version === plugin.version)?.status === 'suspended';

  return (
    <div id={panelId} className="mt-4 space-y-6 border-t border-border pt-4">
      <p role="status" className="text-sm text-foreground empty:hidden">
        {notice}
      </p>

      {loading ? (
        <LoadingLine label="Loading versions and history…" />
      ) : view === null ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
          <button
            type="button"
            className={ACTION_CLASS}
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {loadError ? (
            <p role="alert" className="text-sm text-danger">
              {loadError}
            </p>
          ) : null}

          <div className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                {target
                  ? `Rolling back makes ${target.version} the current version and moves installations on ${plugin.version} back to it.`
                  : 'There is no earlier published version to roll back to.'}
              </p>
              {target ? (
                <button
                  type="button"
                  className={ACTION_CLASS}
                  disabled={busy}
                  onClick={() => rollBack(target, currentSuspended)}
                >
                  {isPending('rollback', null) ? 'Rolling back…' : `Roll back to ${target.version}`}
                </button>
              ) : null}
            </div>
            {failure && failure.version === null ? (
              <p role="alert" className="text-sm text-danger">
                {failure.message}
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground">Versions</h3>
            {view.versions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                This plugin has no recorded versions.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {view.versions.map((version) => (
                  <li key={version.version} className="py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                          <span className="break-all font-mono">{version.version}</span>
                          <StatusBadge status={version.status} />
                          {version.version === plugin.version ? (
                            <span className={`${BADGE_CLASS} ${TONE_CLASS.neutral}`}>Current</span>
                          ) : null}
                        </p>
                        <dl className="grid gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">Published</dt>
                            <dd className="mt-0.5 text-foreground">
                              {version.publishedAt
                                ? formatDateTime(version.publishedAt)
                                : 'Not published'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Declared permissions</dt>
                            <dd className="mt-0.5 break-words font-mono text-foreground">
                              {version.permissions.length > 0
                                ? version.permissions.join(', ')
                                : 'None'}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-muted-foreground">Changelog</dt>
                            <dd className="mt-0.5 whitespace-pre-line break-words text-foreground">
                              {version.changelog.trim() || 'No changelog'}
                            </dd>
                          </div>
                          {version.lifecycleReason ? (
                            <div className="sm:col-span-2">
                              <dt className="text-muted-foreground">Reason</dt>
                              <dd className="mt-0.5 break-words text-foreground">
                                {version.lifecycleReason}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {version.status === 'in_review' ? (
                          <button
                            type="button"
                            className={ACTION_CLASS}
                            disabled={busy}
                            onClick={() => publish(version.version)}
                          >
                            {isPending('publish', version.version) ? 'Publishing…' : 'Publish'}
                          </button>
                        ) : null}
                        {version.status === 'published' ? (
                          <button
                            type="button"
                            className={ACTION_CLASS}
                            disabled={busy}
                            onClick={(event) =>
                              openDraft('deprecate', version.version, event.currentTarget)
                            }
                          >
                            Deprecate
                          </button>
                        ) : null}
                        {version.status === 'published' || version.status === 'deprecated' ? (
                          <button
                            type="button"
                            className={DESTRUCTIVE_CLASS}
                            disabled={busy}
                            onClick={(event) =>
                              openDraft('suspend', version.version, event.currentTarget)
                            }
                          >
                            Suspend
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {draft?.version === version.version ? (
                      <form className="mt-3 space-y-3" onSubmit={submitDraft}>
                        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                          Reason, shown on the plugin page and recorded in the audit log
                          <textarea
                            ref={reasonField}
                            value={draft.reason}
                            onChange={(event) => {
                              const reason = event.target.value;
                              setDraft((current) => (current ? { ...current, reason } : current));
                            }}
                            rows={3}
                            className={FIELD_CLASS}
                          />
                        </label>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {consequence(draft.action, version.version)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={busy}
                            className={
                              draft.action === 'suspend' ? DESTRUCTIVE_CLASS : ACTION_CLASS
                            }
                          >
                            {isPending(draft.action, version.version)
                              ? REASON_ACTION_COPY[draft.action].working
                              : `${REASON_ACTION_COPY[draft.action].label} ${version.version}`}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={ACTION_CLASS}
                            onClick={closeDraft}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {failure?.version === version.version ? (
                      <p role="alert" className="mt-2 text-sm text-danger">
                        {failure.message}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground">History</h3>
            {view.events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No lifecycle action is recorded for this plugin yet.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {view.events.map((event) => (
                  <li
                    key={`${event.createdAt}:${event.action}:${event.version}`}
                    className="space-y-1 py-2"
                  >
                    <p className="text-sm text-foreground">
                      {EVENT_TITLE[event.action](event.version)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {statusChange(event)} · {formatDateTime(event.createdAt)}
                    </p>
                    {event.reason ? (
                      <p className="break-words text-xs text-muted-foreground">“{event.reason}”</p>
                    ) : null}
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {event.actorUserId}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type ReviewedSubmission = PluginSubmissionReviewListResponse['submissions'][number];

const SUBMISSION_STATUS_VIEW: Record<PluginSubmissionStatus, StatusView> = {
  pending: { label: 'Waiting for review', tone: 'info' },
  approved: { label: 'Listed', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'danger' },
};

const SUBMISSION_FILTERS: ReadonlyArray<{ value: PluginSubmissionStatus; label: string }> = [
  { value: 'pending', label: 'Waiting for review' },
  { value: 'approved', label: 'Listed' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Not approved' },
];

type NoteAction = 'reject' | 'suspend';

function submissionUrl(id: string): string {
  return `${ADMIN_PLUGIN_SUBMISSIONS_PATH}/${encodeURIComponent(id)}`;
}

function SubmissionReviewPanel({
  submission,
  confirm,
  onDecided,
}: {
  submission: ReviewedSubmission;
  confirm: (request: ConfirmActionRequest) => void;
  onDecided: () => Promise<void>;
}) {
  const [review, setReview] = useState<PluginSubmissionReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noteAction, setNoteAction] = useState<NoteAction | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readJson<PluginSubmissionReviewResponse>(submissionUrl(submission.id))
      .then((body) => {
        if (!cancelled) setReview(body.submission);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(toUserMessage(error, 'The submission could not be loaded.'));
      });
    return () => {
      cancelled = true;
    };
  }, [submission.id]);

  async function decide(decision: PluginSubmissionDecision) {
    setPending(true);
    setFailure(null);
    try {
      await readJson(submissionUrl(submission.id), {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(decision),
      });
      setNoteAction(null);
      setNote('');
      await onDecided();
    } catch (error) {
      setFailure(toUserMessage(error, 'That decision could not be saved.'));
    } finally {
      setPending(false);
    }
  }

  const approve = () =>
    confirm({
      title: `Approve ${submission.name}?`,
      description:
        'It is listed in the community directory for everyone at once, and its developer is told. A version it replaces leaves the directory and its installs move to this one.',
      confirmLabel: 'Approve and list',
      cancelLabel: 'Keep reviewing',
      destructive: false,
      onConfirm: () => decide({ action: 'approve' }),
    });

  const submitNote = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = note.trim();
    if (!noteAction || !trimmed) return;
    if (noteAction === 'reject') {
      void decide({ action: 'reject', note: trimmed });
      return;
    }
    confirm({
      title: `Suspend ${submission.name}?`,
      description:
        'It leaves the directory and stops for everyone who installed it. Its developer is told why.',
      confirmLabel: 'Suspend it',
      cancelLabel: 'Keep it listed',
      destructive: true,
      onConfirm: () => decide({ action: 'suspend', note: trimmed }),
    });
  };

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-border bg-background p-4">
      <p className="whitespace-pre-line break-words text-sm text-foreground">
        {submission.description}
      </p>
      <p className="text-xs text-muted-foreground">
        {`Skills: ${submission.skills.join(', ') || 'none'}`}
      </p>
      {submission.scanFindings.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">Scan findings</p>
          <ul className="space-y-1">
            {submission.scanFindings.map((finding) => (
              <li
                key={`${finding.path}:${finding.line}:${finding.message}`}
                className="break-words text-xs text-muted-foreground"
              >
                {`${finding.path}:${finding.line} ${finding.message}`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">The scan found nothing to review.</p>
      )}
      {loadError ? (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      ) : review ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            {`${review.files.length} ${review.files.length === 1 ? 'file' : 'files'} as submitted`}
          </p>
          {review.files.map((file) => (
            <details key={file.path} className="rounded-lg border border-border">
              <summary className="cursor-pointer break-all px-3 py-2 font-mono text-xs text-foreground pointer-coarse:min-h-11">
                {file.path}
              </summary>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2 font-mono text-xs text-foreground">
                {file.content}
              </pre>
            </details>
          ))}
        </div>
      ) : (
        <LoadingLine label="Loading the submitted files…" />
      )}
      {failure ? (
        <p role="alert" className="text-sm text-danger">
          {failure}
        </p>
      ) : null}
      {noteAction ? (
        <form className="space-y-2" onSubmit={submitNote}>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {noteAction === 'reject'
              ? 'Why it was not approved. The developer reads this.'
              : 'Why it is suspended. The developer reads this.'}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={2000}
              className={FIELD_CLASS}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || !note.trim()}
              className={noteAction === 'suspend' ? DESTRUCTIVE_CLASS : ACTION_CLASS}
            >
              {noteAction === 'reject' ? 'Send the decision' : 'Suspend'}
            </button>
            <button
              type="button"
              disabled={pending}
              className={ACTION_CLASS}
              onClick={() => {
                setNoteAction(null);
                setNote('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : submission.status === 'pending' ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} className={ACTION_CLASS} onClick={approve}>
            Approve
          </button>
          <button
            type="button"
            disabled={pending}
            className={ACTION_CLASS}
            onClick={() => setNoteAction('reject')}
          >
            Reject
          </button>
        </div>
      ) : submission.status === 'approved' ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className={DESTRUCTIVE_CLASS}
            onClick={() => setNoteAction('suspend')}
          >
            Suspend
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SubmissionQueue({ confirm }: { confirm: (request: ConfirmActionRequest) => void }) {
  const [status, setStatus] = useState<PluginSubmissionStatus>('pending');
  const [submissions, setSubmissions] = useState<ReviewedSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async (next: PluginSubmissionStatus) => {
    const request = latest.current + 1;
    latest.current = request;
    setLoading(true);
    try {
      const body = await readJson<PluginSubmissionReviewListResponse>(
        `${ADMIN_PLUGIN_SUBMISSIONS_PATH}?${PLUGIN_SUBMISSION_REVIEW_STATUS_PARAM}=${next}`,
      );
      if (request !== latest.current) return;
      setSubmissions(body.submissions);
      setError(null);
    } catch (loadFailure) {
      if (request !== latest.current) return;
      setError(toUserMessage(loadFailure, 'The submissions could not be loaded.'));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="plugin-submissions-title">
      <h2 id="plugin-submissions-title" className="text-h5">
        Community submissions
      </h2>
      <div className={CARD_CLASS}>
        <label className="flex max-w-xs flex-col gap-1 text-xs text-muted-foreground">
          Show
          <select
            value={status}
            onChange={(event) => {
              setOpenId(null);
              setStatus(event.target.value as PluginSubmissionStatus);
            }}
            className={FIELD_CLASS}
          >
            {SUBMISSION_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 border-t border-border pt-4">
          {loading ? (
            <LoadingLine label="Loading submissions…" />
          ) : error ? (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
              <button type="button" className={ACTION_CLASS} onClick={() => void load(status)}>
                Try again
              </button>
            </div>
          ) : submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {submissions.map((submission) => {
                const open = submission.id === openId;
                const view = SUBMISSION_STATUS_VIEW[submission.status];
                return (
                  <li key={submission.id} className="py-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                          <span className="break-words font-medium">{submission.name}</span>
                          <span className={`${BADGE_CLASS} ${TONE_CLASS[view.tone]}`}>
                            {view.label}
                          </span>
                          {submission.scanVerdict === 'review' ? (
                            <span className={`${BADGE_CLASS} ${TONE_CLASS.warning}`}>
                              Scan findings
                            </span>
                          ) : null}
                        </p>
                        <p className="break-words text-xs text-muted-foreground">
                          {`${submission.publisherName} · version ${submission.version} · submitted ${formatDateTime(submission.submittedAt)}`}
                        </p>
                        {submission.reviewNote ? (
                          <p className="break-words text-xs text-muted-foreground">
                            “{submission.reviewNote}”
                          </p>
                        ) : null}
                        <p className="break-all font-mono text-xs text-muted-foreground">
                          {submission.submitterId}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`${ACTION_CLASS} self-start`}
                        aria-expanded={open}
                        aria-label={`${open ? 'Close' : 'Review'} ${submission.name}`}
                        onClick={() => setOpenId(open ? null : submission.id)}
                      >
                        {open ? 'Close' : 'Review'}
                      </button>
                    </div>
                    {open ? (
                      <SubmissionReviewPanel
                        key={submission.id}
                        submission={submission}
                        confirm={confirm}
                        onDecided={async () => {
                          setOpenId(null);
                          await load(status);
                        }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default function PluginModerationPage() {
  const { confirm, dialog } = useConfirmAction();
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [plugins, setPlugins] = useState<PluginModerationEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const latestList = useRef(0);
  const activeQueryRef = useRef('');

  const loadList = useCallback(async (search: string) => {
    const request = latestList.current + 1;
    latestList.current = request;
    try {
      const body = await readJson<PluginListResponse>(listUrl(search));
      if (request !== latestList.current) return;
      setPlugins(body.plugins);
      setTotal(body.total);
      setListError(null);
    } catch (loadFailure) {
      if (request !== latestList.current) return;
      setListError(toUserMessage(loadFailure, 'The plugin registry could not be loaded.'));
    } finally {
      if (request === latestList.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList('');
  }, [loadList]);

  const refreshList = useCallback(() => loadList(activeQueryRef.current), [loadList]);

  function search(next: string) {
    activeQueryRef.current = next;
    setLoading(true);
    setOpenId(null);
    setPlugins([]);
    setTotal(0);
    setListError(null);
    setActiveQuery(next);
    void loadList(next);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-h1 text-foreground">Plugin moderation</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review the plugins in the registry and act on their versions. Publishing a version in
            review makes it the one new installs get. Deprecating a version tells people not to
            install it, suspending one stops every installation running it, and a rollback returns
            the plugin to its previous published version. Every action is recorded in the plugin
            history and the security audit log.
          </p>
        </header>

        {dialog}

        <SubmissionQueue confirm={confirm} />

        <section className="flex flex-col gap-3" aria-labelledby="plugin-registry-title">
          <h2 id="plugin-registry-title" className="text-h5">
            Registry plugins
          </h2>
          <div className={CARD_CLASS}>
            <form
              role="search"
              className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                search(query.trim());
              }}
            >
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Name, plugin id or publisher
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              <button type="submit" disabled={loading} className={ACTION_CLASS}>
                Search
              </button>
            </form>

            <div className="mt-4 border-t border-border pt-4">
              {loading ? (
                <LoadingLine label="Loading the registry…" />
              ) : plugins.length === 0 && listError ? (
                <div className="flex flex-col items-start gap-3">
                  <p role="alert" className="text-sm text-danger">
                    {listError}
                  </p>
                  <button
                    type="button"
                    className={ACTION_CLASS}
                    onClick={() => search(activeQuery)}
                  >
                    Try again
                  </button>
                </div>
              ) : plugins.length === 0 ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-muted-foreground">
                    {activeQuery
                      ? `No plugin matches “${activeQuery}”.`
                      : 'The registry has no plugins yet.'}
                  </p>
                  {activeQuery ? (
                    <button
                      type="button"
                      className={ACTION_CLASS}
                      onClick={() => {
                        setQuery('');
                        search('');
                      }}
                    >
                      Show all plugins
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  {listError ? (
                    <p role="alert" className="text-sm text-danger">
                      {listError}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      {total > plugins.length
                        ? `Showing the first ${plugins.length} of ${total} plugins. Search to narrow the list.`
                        : activeQuery
                          ? `${plugins.length} ${plugins.length === 1 ? 'plugin matches' : 'plugins match'} “${activeQuery}”.`
                          : `${plugins.length} ${plugins.length === 1 ? 'plugin' : 'plugins'} in the registry.`}
                    </p>
                    {activeQuery ? (
                      <button
                        type="button"
                        className={`${ACTION_CLASS} self-start`}
                        onClick={() => {
                          setQuery('');
                          search('');
                        }}
                      >
                        Show all plugins
                      </button>
                    ) : null}
                  </div>
                  <ul className="divide-y divide-border">
                    {plugins.map((plugin) => {
                      const open = plugin.id === openId;
                      const panelId = `plugin-review-${plugin.id}`;
                      return (
                        <li key={plugin.id} className="py-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 space-y-1">
                              <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                                <span className="break-words font-medium">{plugin.name}</span>
                                <StatusBadge status={plugin.status} />
                                {plugin.versionsInReview > 0 ? (
                                  <span className={`${BADGE_CLASS} ${TONE_CLASS.info}`}>
                                    {plugin.versionsInReview} in review
                                  </span>
                                ) : null}
                              </p>
                              <p className="break-words text-xs text-muted-foreground">
                                {plugin.publisherName} · version {plugin.version}
                              </p>
                              <p className="break-all font-mono text-xs text-muted-foreground">
                                {plugin.id}
                              </p>
                            </div>
                            <button
                              type="button"
                              className={`${ACTION_CLASS} self-start`}
                              aria-expanded={open}
                              aria-controls={open ? panelId : undefined}
                              aria-label={`${open ? 'Close' : 'Review'} ${plugin.name}`}
                              onClick={() => setOpenId(open ? null : plugin.id)}
                            >
                              {open ? 'Close' : 'Review'}
                            </button>
                          </div>
                          {open ? (
                            <PluginReviewPanel
                              key={plugin.id}
                              panelId={panelId}
                              plugin={plugin}
                              confirm={confirm}
                              onChanged={refreshList}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
