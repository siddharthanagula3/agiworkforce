'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner, useConfirm } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import type { FlagDefinition, FlagOverride } from '@/lib/feature-flags/flag-definition';
import { formatDateTime, NONE } from '../lib/operator-format';

const FLAGS_ENDPOINT = '/api/admin/feature-flags';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const ACTION_CLASS =
  'rounded-full border border-border px-4 py-2 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50';
const DESTRUCTIVE_CLASS =
  'rounded-full border border-destructive/50 px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-destructive/10 disabled:opacity-50';

const EMPTY_RULES = '[]';
const DEFAULT_VARIANTS = 'on, off';

interface FlagForm {
  key: string;
  description: string;
  variants: string;
  defaultVariant: string;
  expiresAt: string;
  rules: string;
}

const EMPTY_FORM: FlagForm = {
  key: '',
  description: '',
  variants: DEFAULT_VARIANTS,
  defaultVariant: 'off',
  expiresAt: '',
  rules: EMPTY_RULES,
};

interface OverrideForm {
  subject: 'user' | 'workspace';
  subjectId: string;
  variant: string;
}

const EMPTY_OVERRIDE: OverrideForm = { subject: 'user', subjectId: '', variant: 'on' };

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

async function mutate<T>(url: string, method: string, payload: unknown): Promise<T> {
  return readJson<T>(url, {
    method,
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

function flagState(flag: FlagDefinition, nowMs: number): string {
  if (flag.archivedAt) return 'Archived';
  if (flag.killSwitch) return 'Kill switch engaged';
  if (flag.expiresAt && Date.parse(flag.expiresAt) <= nowMs) return 'Expired';
  return 'Live';
}

function formFor(flag: FlagDefinition): FlagForm {
  return {
    key: flag.key,
    description: flag.description,
    variants: flag.variants.join(', '),
    defaultVariant: flag.defaultVariant,
    expiresAt: flag.expiresAt ? flag.expiresAt.slice(0, 16) : '',
    rules: JSON.stringify(flag.rules, null, 2),
  };
}

function definitionPayload(form: FlagForm): Record<string, unknown> {
  return {
    key: form.key.trim(),
    description: form.description.trim(),
    variants: form.variants
      .split(',')
      .map((variant) => variant.trim())
      .filter(Boolean),
    defaultVariant: form.defaultVariant.trim(),
    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    rules: JSON.parse(form.rules || EMPTY_RULES),
  };
}

export default function FeatureFlagsPanel() {
  const [flags, setFlags] = useState<FlagDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FlagForm>(EMPTY_FORM);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [openFlag, setOpenFlag] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<FlagOverride[] | null>(null);
  const [overrideForm, setOverrideForm] = useState<OverrideForm>(EMPTY_OVERRIDE);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      const body = await readJson<{ flags: FlagDefinition[] }>(FLAGS_ENDPOINT);
      setFlags(body.flags);
    } catch (loadError) {
      setError(toUserMessage(loadError, 'Could not read the flag definitions.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openOverrides(key: string) {
    if (openFlag === key) {
      setOpenFlag(null);
      setOverrides(null);
      return;
    }
    setOpenFlag(key);
    setOverrides(null);
    try {
      const body = await readJson<{ overrides: FlagOverride[] }>(
        `${FLAGS_ENDPOINT}/${encodeURIComponent(key)}`,
      );
      setOverrides(body.overrides);
    } catch (loadError) {
      setError(toUserMessage(loadError, 'Could not read the overrides for that flag.'));
    }
  }

  async function submitDefinition() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = definitionPayload(form);
      if (editingVersion === null) {
        await mutate(FLAGS_ENDPOINT, 'POST', payload);
        setNotice(
          `Flag ${payload['key'] as string} created. It serves its default until a rule matches.`,
        );
      } else {
        await mutate(`${FLAGS_ENDPOINT}/${encodeURIComponent(form.key)}`, 'PUT', {
          expectedVersion: editingVersion,
          flag: payload,
        });
        setNotice(`Flag ${form.key} updated.`);
      }
      setForm(EMPTY_FORM);
      setEditingVersion(null);
      await load();
    } catch (submitError) {
      setError(toUserMessage(submitError, 'Could not save that flag.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleKillSwitch(flag: FlagDefinition) {
    if (!flag.killSwitch) {
      const acknowledged = await confirm({
        title: `Serve ${flag.key} as off for everyone?`,
        description:
          'The kill switch overrides every rule, percentage and override at once, so every user and workspace that currently has this flag loses it on their next request. Turning it back off restores the targeting as it was; nothing about the definition is lost.',
        confirmText: 'Engage kill switch',
        variant: 'destructive',
      });
      if (!acknowledged) return;
    }
    setBusy(true);
    setError(null);
    try {
      await mutate(`${FLAGS_ENDPOINT}/${encodeURIComponent(flag.key)}`, 'PATCH', {
        killSwitch: !flag.killSwitch,
      });
      await load();
    } catch (toggleError) {
      setError(toUserMessage(toggleError, 'Could not change the kill switch.'));
    } finally {
      setBusy(false);
    }
  }

  async function archive(flag: FlagDefinition) {
    const acknowledged = await confirm({
      title: `Archive ${flag.key}?`,
      description:
        'An archived flag stops being evaluated for everyone, and this console does not bring it back: a replacement has to be created under the same name. Its overrides stay in place but answer nothing.',
      confirmText: 'Archive',
      variant: 'destructive',
    });
    if (!acknowledged) return;
    setBusy(true);
    setError(null);
    try {
      await mutate(`${FLAGS_ENDPOINT}/${encodeURIComponent(flag.key)}`, 'DELETE', {});
      await load();
    } catch (archiveError) {
      setError(toUserMessage(archiveError, 'Could not archive that flag.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveOverride(key: string) {
    setBusy(true);
    setError(null);
    try {
      await mutate(`${FLAGS_ENDPOINT}/${encodeURIComponent(key)}/overrides`, 'PUT', {
        ...overrideForm,
        subjectId: overrideForm.subjectId.trim(),
        expiresAt: null,
      });
      setOverrideForm(EMPTY_OVERRIDE);
      const body = await readJson<{ overrides: FlagOverride[] }>(
        `${FLAGS_ENDPOINT}/${encodeURIComponent(key)}`,
      );
      setOverrides(body.overrides);
    } catch (overrideError) {
      setError(toUserMessage(overrideError, 'Could not set that override.'));
    } finally {
      setBusy(false);
    }
  }

  async function removeOverride(key: string, override: FlagOverride) {
    setBusy(true);
    setError(null);
    try {
      await mutate(`${FLAGS_ENDPOINT}/${encodeURIComponent(key)}/overrides`, 'DELETE', {
        subject: override.subject,
        subjectId: override.subjectId,
      });
      setOverrides((current) =>
        (current ?? []).filter(
          (entry) => entry.subject !== override.subject || entry.subjectId !== override.subjectId,
        ),
      );
    } catch (removeError) {
      setError(toUserMessage(removeError, 'Could not remove that override.'));
    } finally {
      setBusy(false);
    }
  }

  const nowMs = Date.now();

  return (
    <section className="flex flex-col gap-4" aria-labelledby="feature-flags-title">
      <div>
        <h2 id="feature-flags-title" className="text-sm font-medium">
          Feature flags
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Rollout targeting by user, workspace, role, plan, region, country, surface, client version
          and percentage, with experiment variants and a kill switch. Flags decide who has received
          a change yet; what a workspace is allowed to do stays in workspace policy.
        </p>
      </div>

      {dialog}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {flags === null ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading flag definitions…</span>
        </div>
      ) : (
        <div className={TABLE_WRAP_CLASS}>
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-card text-left">
              <tr>
                <th className="p-3 font-medium">Flag</th>
                <th className="p-3 font-medium">State</th>
                <th className="p-3 font-medium">Default</th>
                <th className="p-3 font-medium">Rules</th>
                <th className="p-3 font-medium">Expires</th>
                <th className="p-3 font-medium">Version</th>
                <th className="p-3 font-medium">Controls</th>
              </tr>
            </thead>
            <tbody>
              {flags.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={7}>
                    No flag is defined, so every surface runs its shipped default.
                  </td>
                </tr>
              ) : null}
              {flags.map((flag) => (
                <tr key={flag.key} className="border-t border-border align-top">
                  <td className="p-3">
                    <div className="font-mono text-xs">{flag.key}</div>
                    <div className="text-xs text-muted-foreground">{flag.description || NONE}</div>
                  </td>
                  <td className="p-3 text-xs">{flagState(flag, nowMs)}</td>
                  <td className="p-3 font-mono text-xs">{flag.defaultVariant}</td>
                  <td className="p-3 tabular-nums">{flag.rules.length}</td>
                  <td className="p-3 text-xs">
                    {flag.expiresAt ? formatDateTime(flag.expiresAt) : NONE}
                  </td>
                  <td className="p-3 tabular-nums">{flag.version}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={ACTION_CLASS}
                        disabled={busy}
                        onClick={() => {
                          setForm(formFor(flag));
                          setEditingVersion(flag.version);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className={ACTION_CLASS}
                        disabled={busy}
                        onClick={() => void toggleKillSwitch(flag)}
                      >
                        {flag.killSwitch ? 'Restore' : 'Kill'}
                      </button>
                      <button
                        className={ACTION_CLASS}
                        disabled={busy}
                        onClick={() => void openOverrides(flag.key)}
                      >
                        Overrides
                      </button>
                      <button
                        className={DESTRUCTIVE_CLASS}
                        disabled={busy}
                        onClick={() => void archive(flag)}
                      >
                        Archive
                      </button>
                    </div>
                    {openFlag === flag.key ? (
                      <div className="mt-3 border-t border-border pt-3">
                        {overrides === null ? (
                          <div className="flex items-center gap-2">
                            <Spinner size="sm" />
                            <span className="text-xs text-muted-foreground">
                              Reading overrides…
                            </span>
                          </div>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {overrides.length === 0 ? (
                              <li className="text-xs text-muted-foreground">
                                No override; every subject answers to the rules above.
                              </li>
                            ) : null}
                            {overrides.map((override) => (
                              <li
                                key={`${override.subject}:${override.subjectId}`}
                                className="flex flex-wrap items-center gap-2 text-xs"
                              >
                                <span className="font-mono">
                                  {override.subject}:{override.subjectId}
                                </span>
                                <span className="font-mono">{override.variant}</span>
                                <button
                                  className={ACTION_CLASS}
                                  disabled={busy}
                                  onClick={() => void removeOverride(flag.key, override)}
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end">
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Subject
                            <select
                              className={FIELD_CLASS}
                              value={overrideForm.subject}
                              onChange={(event) =>
                                setOverrideForm((current) => ({
                                  ...current,
                                  subject: event.target.value as OverrideForm['subject'],
                                }))
                              }
                            >
                              <option value="user">User</option>
                              <option value="workspace">Workspace</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Subject id
                            <input
                              className={FIELD_CLASS}
                              value={overrideForm.subjectId}
                              onChange={(event) =>
                                setOverrideForm((current) => ({
                                  ...current,
                                  subjectId: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Variant
                            <select
                              className={FIELD_CLASS}
                              value={overrideForm.variant}
                              onChange={(event) =>
                                setOverrideForm((current) => ({
                                  ...current,
                                  variant: event.target.value,
                                }))
                              }
                            >
                              {flag.variants.map((variant) => (
                                <option key={variant} value={variant}>
                                  {variant}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className={ACTION_CLASS}
                            disabled={busy || overrideForm.subjectId.trim().length === 0}
                            onClick={() => void saveOverride(flag.key)}
                          >
                            Set override
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={CARD_CLASS}>
        <h3 className="text-sm font-medium">
          {editingVersion === null ? 'New flag' : `Editing ${form.key}`}
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Key
            <input
              className={FIELD_CLASS}
              value={form.key}
              readOnly={editingVersion !== null}
              onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Description
            <input
              className={FIELD_CLASS}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Variants, comma separated, including off
            <input
              className={FIELD_CLASS}
              value={form.variants}
              onChange={(event) =>
                setForm((current) => ({ ...current, variants: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Default variant
            <input
              className={FIELD_CLASS}
              value={form.defaultVariant}
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultVariant: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Expires
            <input
              type="datetime-local"
              className={FIELD_CLASS}
              value={form.expiresAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, expiresAt: event.target.value }))
              }
            />
          </label>
        </div>
        <label className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
          Rules, in order: the first whose conditions match and whose rollout bucket includes the
          subject wins
          <textarea
            className={`${FIELD_CLASS} min-h-40 font-mono text-xs`}
            value={form.rules}
            onChange={(event) => setForm((current) => ({ ...current, rules: event.target.value }))}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={ACTION_CLASS} disabled={busy} onClick={() => void submitDefinition()}>
            {editingVersion === null ? 'Create flag' : 'Save flag'}
          </button>
          {editingVersion === null ? null : (
            <button
              className={ACTION_CLASS}
              disabled={busy}
              onClick={() => {
                setForm(EMPTY_FORM);
                setEditingVersion(null);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
