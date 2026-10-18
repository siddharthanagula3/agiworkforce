'use client';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import {
  OPERATOR_UPGRADE_ACCESS_CODES_PATH,
  OPERATOR_UPGRADE_ACCESS_PATH,
  OperatorUpgradeAccessCodeResponseSchema,
  OperatorUpgradeAccessCodesResponseSchema,
  OperatorUpgradeAccessStateSchema,
  UPGRADE_ACCESS_CODE_MAX_LENGTH,
  UPGRADE_ACCESS_CODE_MAX_REDEMPTIONS,
  UPGRADE_ACCESS_CODE_MIN_LENGTH,
  UPGRADE_ACCESS_CODE_NOTE_MAX_LENGTH,
  type OperatorUpgradeAccessCode,
  type OperatorUpgradeAccessCodesResponse,
  type OperatorUpgradeAccessState,
} from '@agiworkforce/cloud-contracts/waitlist';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { apiErrorMessage } from '@/shared/utils/api-error';
import { formatCount, formatDateTime, NONE, NOT_RECORDED } from '../lib/operator-format';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const QUIET_BUTTON_CLASS =
  'rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-foreground/30 disabled:opacity-50';
const PRIMARY_BUTTON_CLASS =
  'rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50';

const STATE_UNREADABLE = 'Could not read whether paid upgrades are open.';
const STATE_UNCHANGED = 'Paid upgrade access was not changed.';
const CODES_UNREADABLE = 'Could not load the access codes.';
const CODE_NOT_CREATED = 'The access code was not created.';
const CODE_NOT_DISABLED = 'The access code was not disabled.';
const DEFAULT_MAX_REDEMPTIONS = '1';
const FORCE_OPEN_SETTING = 'AGI_BILLING_WAITLIST_OPEN=1';

async function requestJson(path: string, init: RequestInit, fallback: string): Promise<unknown> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body;
  throw new Error(apiErrorMessage(body, fallback));
}

async function writeJson(
  path: string,
  method: 'POST' | 'DELETE',
  payload: unknown,
  fallback: string,
): Promise<unknown> {
  return requestJson(
    path,
    {
      method,
      headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    fallback,
  );
}

function codeStatus(code: OperatorUpgradeAccessCode, nowMs: number): string {
  if (!code.active) return 'Disabled';
  if (code.expiresAt !== null && Date.parse(code.expiresAt) <= nowMs) return 'Expired';
  if (code.redemptions >= code.maxRedemptions) return 'Fully redeemed';
  return 'Active';
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className={`${CARD_CLASS} flex items-center gap-3`}>
      <Spinner size="sm" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function UpgradeSwitch() {
  const { confirm, dialog } = useConfirmAction();
  const [state, setState] = useState<OperatorUpgradeAccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(
        OperatorUpgradeAccessStateSchema.parse(
          await requestJson(OPERATOR_UPGRADE_ACCESS_PATH, {}, STATE_UNREADABLE),
        ),
      );
    } catch (loadError) {
      setError(toUserMessage(loadError, STATE_UNREADABLE));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (open: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setState(
        OperatorUpgradeAccessStateSchema.parse(
          await writeJson(OPERATOR_UPGRADE_ACCESS_PATH, 'POST', { open }, STATE_UNCHANGED),
        ),
      );
    } catch (changeError) {
      setError(toUserMessage(changeError, STATE_UNCHANGED));
    } finally {
      setBusy(false);
    }
  };

  const askToOpen = () =>
    confirm({
      title: 'Open paid upgrades to everyone?',
      description:
        'Every signed-in person can start checkout and store purchases immediately, with no access code and no waitlist. Real cards are charged from that moment. It takes effect within a few minutes, with no deployment and no new app build, and you can close upgrades again here.',
      confirmLabel: 'Open paid upgrades',
      destructive: false,
      onConfirm: () => change(true),
    });

  const askToClose = () =>
    confirm({
      title: 'Close paid upgrades?',
      description:
        'New upgrades need an access code again, and everyone without one is offered the waitlist instead of checkout. Existing subscribers are unaffected: they keep their plan, their billing portal and their renewals. It takes effect within a few minutes, and you can open upgrades again here.',
      confirmLabel: 'Close paid upgrades',
      onConfirm: () => change(false),
    });

  if (state === null) {
    return error ? (
      <p role="alert" className="text-sm text-danger-text">
        {error}
      </p>
    ) : (
      <LoadingCard label="Reading paid upgrade access…" />
    );
  }

  return (
    <div className={CARD_CLASS}>
      {dialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Paid upgrades are</p>
          <p className="mt-1 text-h5" data-testid="upgrade-access-state">
            {state.open ? 'Open to everyone' : 'Behind the waitlist'}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {state.open
              ? 'Any signed-in account can start checkout, open the billing portal and buy in the mobile stores. No screen asks for an access code.'
              : 'Only an account that redeemed an access code can start checkout or a store purchase. Everyone else is offered the upgrade waitlist. Existing subscribers are unaffected.'}
          </p>
        </div>
        {state.switchOpen ? (
          <button type="button" className={QUIET_BUTTON_CLASS} disabled={busy} onClick={askToClose}>
            Close paid upgrades
          </button>
        ) : (
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            disabled={busy}
            onClick={askToOpen}
          >
            Open paid upgrades to everyone
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {state.lastChange
          ? `Last ${state.lastChange.opened ? 'opened' : 'closed'} on ${formatDateTime(state.lastChange.changedAt)} by ${state.lastChange.changedBy ?? NOT_RECORDED}.`
          : 'Nobody has changed this switch yet.'}
      </p>
      {state.forcedOpenByEnvironment ? (
        <p className="mt-2 text-sm">
          This deployment sets <span className="font-mono">{FORCE_OPEN_SETTING}</span>, which holds
          upgrades open whatever this switch says. Remove that setting and redeploy before relying
          on this switch to close them.
        </p>
      ) : null}
      {state.targetingRules > 0 ? (
        <p className="mt-2 text-sm">
          {formatCount(state.targetingRules)} targeting rule(s) on this switch also admit or refuse
          particular accounts. Review them in the flags tab.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AccessCodes() {
  const { confirm, dialog } = useConfirmAction();
  const codeId = useId();
  const limitId = useId();
  const expiryId = useId();
  const noteId = useId();
  const [list, setList] = useState<OperatorUpgradeAccessCodesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState(DEFAULT_MAX_REDEMPTIONS);
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setList(
        OperatorUpgradeAccessCodesResponseSchema.parse(
          await requestJson(OPERATOR_UPGRADE_ACCESS_CODES_PATH, {}, CODES_UNREADABLE),
        ),
      );
    } catch (error) {
      setLoadError(toUserMessage(error, CODES_UNREADABLE));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setCreated(null);
    try {
      const { code: issued } = OperatorUpgradeAccessCodeResponseSchema.parse(
        await writeJson(
          OPERATOR_UPGRADE_ACCESS_CODES_PATH,
          'POST',
          {
            ...(code.trim() ? { code: code.trim() } : {}),
            maxRedemptions: Number(maxRedemptions),
            ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
          CODE_NOT_CREATED,
        ),
      );
      setCreated(issued.code);
      setCode('');
      setMaxRedemptions(DEFAULT_MAX_REDEMPTIONS);
      setExpiresAt('');
      setNote('');
      await load();
    } catch (error) {
      setFormError(toUserMessage(error, CODE_NOT_CREATED));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (target: OperatorUpgradeAccessCode) => {
    setBusy(true);
    setFormError(null);
    try {
      await writeJson(
        OPERATOR_UPGRADE_ACCESS_CODES_PATH,
        'DELETE',
        { id: target.id },
        CODE_NOT_DISABLED,
      );
      await load();
    } catch (error) {
      setFormError(toUserMessage(error, CODE_NOT_DISABLED));
    } finally {
      setBusy(false);
    }
  };

  const nowMs = Date.now();

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <div>
        <h3 className="text-h5">Access codes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A code lets the accounts that redeem it upgrade while paid upgrades are behind the
          waitlist. It grants access to checkout only, never a plan or a trial. Each creation and
          each disabling is written to the audit log with your account, never the code itself.
        </p>
      </div>

      <form
        className={`${CARD_CLASS} grid gap-3 sm:grid-cols-2`}
        onSubmit={(event) => void create(event)}
      >
        <div>
          <label htmlFor={codeId} className="text-sm font-medium">
            Code
          </label>
          <input
            id={codeId}
            value={code}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            minLength={UPGRADE_ACCESS_CODE_MIN_LENGTH}
            maxLength={UPGRADE_ACCESS_CODE_MAX_LENGTH}
            pattern="[A-Za-z0-9]+"
            placeholder="Leave empty to generate one"
            onChange={(event) => setCode(event.target.value)}
            className={`${FIELD_CLASS} mt-1 font-mono uppercase`}
          />
          <p className="mt-1 text-sm text-muted-foreground">
            Letters and digits only, {UPGRADE_ACCESS_CODE_MIN_LENGTH} to{' '}
            {UPGRADE_ACCESS_CODE_MAX_LENGTH} characters.
          </p>
        </div>
        <div>
          <label htmlFor={limitId} className="text-sm font-medium">
            Maximum redemptions
          </label>
          <input
            id={limitId}
            type="number"
            required
            min={1}
            max={UPGRADE_ACCESS_CODE_MAX_REDEMPTIONS}
            step={1}
            value={maxRedemptions}
            disabled={busy}
            onChange={(event) => setMaxRedemptions(event.target.value)}
            className={`${FIELD_CLASS} mt-1`}
          />
          <p className="mt-1 text-sm text-muted-foreground">
            How many different accounts may redeem it.
          </p>
        </div>
        <div>
          <label htmlFor={expiryId} className="text-sm font-medium">
            Expires
          </label>
          <input
            id={expiryId}
            type="datetime-local"
            value={expiresAt}
            disabled={busy}
            onChange={(event) => setExpiresAt(event.target.value)}
            className={`${FIELD_CLASS} mt-1`}
          />
          <p className="mt-1 text-sm text-muted-foreground">
            Optional, in your local time. Empty means it does not expire.
          </p>
        </div>
        <div>
          <label htmlFor={noteId} className="text-sm font-medium">
            Note
          </label>
          <input
            id={noteId}
            value={note}
            disabled={busy}
            maxLength={UPGRADE_ACCESS_CODE_NOTE_MAX_LENGTH}
            placeholder="Who this code is for"
            onChange={(event) => setNote(event.target.value)}
            className={`${FIELD_CLASS} mt-1`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
            {busy ? 'Working…' : 'Create access code'}
          </button>
          {created ? (
            <p role="status" className="text-sm">
              Created <span className="font-mono">{created}</span>. Share it with the people it is
              for.
            </p>
          ) : null}
          {formError ? (
            <p role="alert" className="text-sm text-danger-text">
              {formError}
            </p>
          ) : null}
        </div>
      </form>

      {loadError ? (
        <p role="alert" className="text-sm text-danger-text">
          {loadError}
        </p>
      ) : null}

      {list === null ? (
        loadError ? null : (
          <LoadingCard label="Reading the access codes…" />
        )
      ) : list.codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No access code exists yet. Until one does, nobody can pass the waitlist while paid
          upgrades are closed.
        </p>
      ) : (
        <>
          {list.truncated ? (
            <p className="text-sm text-muted-foreground">
              Showing the newest {formatCount(list.codes.length)} codes.
            </p>
          ) : null}
          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-card text-start">
                <tr>
                  <th scope="col" className="p-3 font-medium">
                    Code
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Redeemed
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Expires
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Note
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Created
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.codes.map((entry) => (
                  <tr key={entry.id} className="border-t border-border align-top">
                    <td className="break-all p-3 font-mono">{entry.code}</td>
                    <td className="p-3 tabular-nums">
                      {formatCount(entry.redemptions)} of {formatCount(entry.maxRedemptions)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {entry.expiresAt ? formatDateTime(entry.expiresAt) : NONE}
                    </td>
                    <td className="p-3">{codeStatus(entry, nowMs)}</td>
                    <td className="p-3 text-muted-foreground">{entry.note ?? NONE}</td>
                    <td className="p-3 text-muted-foreground">{formatDateTime(entry.createdAt)}</td>
                    <td className="p-3">
                      {entry.active ? (
                        <button
                          type="button"
                          className={QUIET_BUTTON_CLASS}
                          disabled={busy}
                          aria-label={`Disable ${entry.code}`}
                          onClick={() =>
                            confirm({
                              title: `Disable ${entry.code}?`,
                              description: `Nobody else can redeem this code, so anyone still holding it unredeemed is back on the waitlist. The ${formatCount(entry.redemptions)} account(s) that already redeemed it keep their upgrade access. A disabled code cannot be switched back on here; you would issue a new one.`,
                              confirmLabel: 'Disable code',
                              onConfirm: () => disable(entry),
                            })
                          }
                        >
                          Disable
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function UpgradeAccessPanel() {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="operator-upgrade-access-title">
      <div>
        <h2 id="operator-upgrade-access-title" className="text-h5">
          Paid upgrade access
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One switch decides whether paid upgrades are open to everyone or held behind the waitlist
          and access codes. It is read on every checkout, portal and store request, so a change
          needs no deployment and no new app build. Each change is written to the audit log with
          your account.
        </p>
      </div>
      <UpgradeSwitch />
      <AccessCodes />
    </section>
  );
}
