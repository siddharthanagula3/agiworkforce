'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FREE_QUOTA_ATTESTATION_PATH,
  FreeQuotaAttestationReceiptSchema,
  FreeQuotaAttestationStatusSchema,
  type FreeQuotaAttestationReceipt,
  type FreeQuotaAttestationRequest,
  type FreeQuotaAttestationStanding,
  type FreeQuotaAttestationStatus,
  type FreeQuotaBlockedOutcome,
  type FreeQuotaTerms,
  type FreeQuotaTermsReviewStanding,
  type FreeQuotaWithdrawalCause,
} from '@agiworkforce/cloud-contracts';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { FREE_QUOTA_CATEGORIES } from '@/features/models/lib/free-quota-types';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { formatCount, formatDurationMs, formatEpochMs } from '../lib/operator-format';

const QWENCLOUD_FREE_QUOTA_DOC = 'https://docs.qwencloud.com/resources/free-quota';
const MODEL_STUDIO_FREE_QUOTA_DOC =
  'https://www.alibabacloud.com/help/en/model-studio/new-free-quota';
const MODEL_STUDIO_FREE_QUOTA_CONSOLE =
  'https://modelstudio.console.alibabacloud.com/ap-southeast-1/costing-balance/free-quota';
const FREE_POOLS_FILE = 'apps/web/config/free-pools.json';
const RUNBOOK_FILE = 'docs/runbooks/free-quota-models.md';
const CLOCK_TICK_MS = 30_000;

const STATUS_UNREADABLE = 'The free model gates could not be read.';
const RECORD_FAILED = 'The console check could not be recorded.';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const ACTION_CLASS =
  'rounded-full border border-border px-4 py-2 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50 pointer-coarse:min-h-11';
const LINK_CLASS = 'font-medium text-foreground underline underline-offset-2';
const CHOICE_CLASS = 'flex min-h-7 items-start gap-2 text-sm pointer-coarse:min-h-11';
const INPUT_CLASS = 'mt-0.5 h-4 w-4 shrink-0 accent-primary';
const DETAILS_CLASS = 'mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]';

type Tone = 'ok' | 'warn' | 'danger';

const TONE_CLASS: Record<Tone, string> = {
  ok: 'border-success-fill/30 bg-success-fill/10 text-success-text',
  warn: 'border-warning-fill/30 bg-warning-fill/10 text-warning-text',
  danger: 'border-danger-fill/30 bg-danger-fill/10 text-danger-text',
};

const OUTCOME_LABEL: Record<FreeQuotaBlockedOutcome, string> = {
  not_integrated: 'Not served here: no exact model match or quota protocol',
  quota_only_not_observed: 'Free quota only was off when the inventory was captured',
  terms_review_missing: 'Not cleared by a current terms review',
  media_not_served: 'Media storage is not configured',
  allowance_unknown: 'Allowance unit not recorded',
  credential_missing: 'No provider key',
  shared_state_unavailable: 'Shared state store unreachable',
  account_billing_signal: 'Billing signal since the last console check',
  attestation_missing: 'No console check recorded',
  attestation_other_credential: 'Console check made for a different key',
  attestation_stale: 'Console check ran out',
  attestation_excludes_offering: 'Not covered by the console check',
  managed_route_shares_allowance: 'Allowance shared with a paid route',
  provider_withdrawn: 'Withdrawn by the provider',
  exhausted: 'Free allowance used up',
  expired: 'Free allowance ended',
};

const TERM_LABEL: Record<keyof FreeQuotaTerms, string> = {
  commercialUseAllowed: 'Commercial use allowed',
  thirdPartyServingAllowed: 'Serving third-party users allowed',
  proxyingAllowed: 'Proxying allowed',
  promptsExcludedFromTraining: 'Prompts excluded from provider training',
};

const WITHDRAWN_CAUSE: Record<FreeQuotaWithdrawalCause, string> = {
  exhausted: 'the provider reported its free quota spent',
  billing: 'the provider refused it with a billing code',
  withdrawn: 'the provider no longer offers it to this account',
};

type ConfiguredStatus = Extract<FreeQuotaAttestationStatus, { configured: true }>;
type Coverage = 'all' | 'selected';

interface Notice {
  tone: Tone;
  text: string;
}

function isLive(standing: string): boolean {
  return standing === 'current' || standing === 'expiring';
}

function liveTermsStanding(status: ConfiguredStatus, nowMs: number): FreeQuotaTermsReviewStanding {
  const { standing, review } = status.termsReview;
  if (!isLive(standing) || !review) return standing;
  const left = review.expiresAtMs - nowMs;
  if (left <= 0) return 'expired';
  return left <= status.termsReviewReminderLeadMs ? 'expiring' : 'current';
}

function liveAttestationStanding(
  status: ConfiguredStatus,
  nowMs: number,
): FreeQuotaAttestationStanding {
  const { standing, record } = status.attestation;
  if (!isLive(standing) || !record) return standing;
  const left = record.freshUntilMs - nowMs;
  if (left <= 0) return 'stale';
  return left <= status.consoleCheckReminderLeadMs ? 'expiring' : 'current';
}

function lapsedSinceRead(status: FreeQuotaAttestationStatus | null, nowMs: number): boolean {
  if (!status?.configured) return false;
  return (
    (isLive(status.termsReview.standing) && liveTermsStanding(status, nowMs) === 'expired') ||
    (isLive(status.attestation.standing) && liveAttestationStanding(status, nowMs) === 'stale')
  );
}

function refusedTerms(terms: FreeQuotaTerms): string[] {
  return (Object.keys(TERM_LABEL) as Array<keyof FreeQuotaTerms>)
    .filter((term) => !terms[term])
    .map((term) => TERM_LABEL[term]);
}

function termsNotice(status: ConfiguredStatus, nowMs: number): Notice {
  const { review } = status.termsReview;
  const until = formatEpochMs(review?.expiresAtMs);
  switch (liveTermsStanding(status, nowMs)) {
    case 'current':
      return { tone: 'ok', text: `The terms review is valid until ${until}.` };
    case 'expiring':
      return {
        tone: 'warn',
        text: `Renew the terms review: it runs out on ${until}, ${formatDurationMs((review?.expiresAtMs ?? nowMs) - nowMs)} from now, and every free model stops serving then. A renewal is a reviewed code change and a deploy, so start it now.`,
      };
    case 'expired':
      return {
        tone: 'danger',
        text: `The terms review ran out on ${until}, so no free model can serve.`,
      };
    case 'not_yet_valid':
      return {
        tone: 'danger',
        text: `The terms review is dated ${formatEpochMs(review?.verifiedAtMs)}, after the server clock, so no free model can serve before then.`,
      };
    case 'terms_refused':
      return {
        tone: 'danger',
        text: `The terms review answers no to: ${review ? refusedTerms(review.terms).join(', ') : ''}. No free model can serve until every term is yes.`,
      };
    case 'missing':
      return {
        tone: 'danger',
        text: 'No terms review is recorded, so no free model can serve.',
      };
  }
}

function attestationNotice(status: ConfiguredStatus, nowMs: number): Notice {
  const { record } = status.attestation;
  const until = formatEpochMs(record?.freshUntilMs);
  switch (liveAttestationStanding(status, nowMs)) {
    case 'current':
      return { tone: 'ok', text: `The console check is valid until ${until}.` };
    case 'expiring':
      return {
        tone: 'warn',
        text: `Renew the console check: it runs out on ${until}, ${formatDurationMs((record?.freshUntilMs ?? nowMs) - nowMs)} from now, and every free model stops serving then.`,
      };
    case 'stale':
      return {
        tone: 'danger',
        text:
          record && record.checkedAtMs > nowMs
            ? 'The console check is dated after the server clock, so it does not count. Record a new check.'
            : `The console check ran out on ${until}, so no free model can serve. Record a new check.`,
      };
    case 'missing':
      return {
        tone: 'danger',
        text: 'No console check is recorded, so no free model can serve.',
      };
    case 'other_credential':
      return {
        tone: 'danger',
        text: 'The console check was recorded for a different provider key than this deployment uses, so no free model can serve. Record a new check for the current key.',
      };
    case 'billing_signal':
      return {
        tone: 'danger',
        text: status.billingSignalUnreadable
          ? `A billing signal record for this key cannot be read, so every free model is withdrawn and a new console check cannot clear it. Check the account's billing, then remove the record as ${RUNBOOK_FILE} describes under Billing signal, and record a new check.`
          : "The provider answered a request with an account billing code, and no console check has been recorded since, so every free model is withdrawn. Check the account's billing and that Free quota only is on, then record a new check.",
      };
  }
}

function billingSignalText(status: ConfiguredStatus): string {
  if (status.billingSignalUnreadable) return 'Recorded, but its record cannot be read';
  if (status.billingSignalAtMs === null) return 'None seen';
  const followed =
    status.attestation.standing === 'billing_signal'
      ? 'not yet followed by a console check'
      : 'followed by a newer console check';
  return `${formatEpochMs(status.billingSignalAtMs)}, ${followed}`;
}

function servingNotice(status: ConfiguredStatus): Notice {
  const { ready, total } = status.serving;
  return ready > 0
    ? { tone: 'ok', text: 'Free models are on.' }
    : {
        tone: 'danger',
        text: `Free models are off: none of the ${formatCount(total)} inventory models can serve.`,
      };
}

function coverageOf(status: ConfiguredStatus): Coverage | null {
  if (!status.attestation.record) return null;
  const everyListed =
    status.offerings.length > 0 && status.offerings.every((offering) => offering.attested);
  return everyListed ? 'all' : 'selected';
}

function attestedKeys(status: ConfiguredStatus): Set<string> {
  return new Set(
    status.offerings.filter((offering) => offering.attested).map((offering) => offering.key),
  );
}

function modelCount(count: number, qualifier = ''): string {
  return `${formatCount(count)} ${qualifier}${count === 1 ? 'model' : 'models'}`;
}

function coveredModels(status: ConfiguredStatus): string {
  const { record } = status.attestation;
  if (!record) return 'None recorded';
  if (record.offerings === 'all') return 'Every inventory model, including any added later';
  const uncovered = status.offerings.filter((offering) => !offering.attested).length;
  const covered = modelCount(record.offerings);
  return uncovered === 0 ? covered : `${covered}, ${modelCount(uncovered, 'listed ')} not covered`;
}

function receiptCoverage(offerings: FreeQuotaAttestationReceipt['offerings']): string {
  return offerings === 'all' ? 'every inventory model' : modelCount(offerings);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(body?.error?.message ?? ''), { status: response.status });
  }
  return body;
}

function NoticeLine({ notice, role }: { notice: Notice; role?: 'status' | 'alert' }) {
  return (
    <p
      role={role}
      data-tone={notice.tone}
      className={`rounded-2xl border px-4 py-3 text-sm ${TONE_CLASS[notice.tone]}`}
    >
      {notice.text}
    </p>
  );
}

function Requirement({ label, present }: { label: string; present: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={present ? 'text-foreground' : 'font-medium text-danger-text'}>
        {present ? 'In place' : 'Missing'}
      </dd>
    </>
  );
}

export default function FreeQuotaAttestationPanel() {
  const [status, setStatus] = useState<FreeQuotaAttestationStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Notice | null>(null);
  const { confirm, dialog } = useConfirmAction();

  const load = useCallback(async (): Promise<FreeQuotaAttestationStatus | null> => {
    setLoadError(null);
    try {
      const response = await fetch(FREE_QUOTA_ATTESTATION_PATH, { cache: 'no-store' });
      const parsed = FreeQuotaAttestationStatusSchema.safeParse(await readJsonResponse(response));
      if (!parsed.success) throw new Error(STATUS_UNREADABLE);
      const next = parsed.data;
      const receivedAtMs = Date.now();
      setOffsetMs(next.configured ? next.nowMs - receivedAtMs : 0);
      setClockMs(receivedAtMs);
      setStatus(next);
      return next;
    } catch (error) {
      setLoadError(toUserMessage(error, STATUS_UNREADABLE));
      return null;
    }
  }, []);

  const loadAndSeedForm = useCallback(async () => {
    const next = await load();
    if (!next?.configured) return;
    setCoverage(coverageOf(next));
    setSelected(attestedKeys(next));
  }, [load]);

  useEffect(() => {
    void loadAndSeedForm();
  }, [loadAndSeedForm]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const nowMs = clockMs + offsetMs;
  const lapsed = lapsedSinceRead(status, nowMs);

  useEffect(() => {
    if (lapsed) void load();
  }, [lapsed, load]);

  function chooseCoverage(next: Coverage, offerings: ConfiguredStatus['offerings']) {
    if (next === 'selected' && coverage === 'all') {
      setSelected(new Set(offerings.map((offering) => offering.key)));
    }
    setCoverage(next);
  }

  function toggleOffering(key: string, on: boolean) {
    setCoverage('selected');
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function record(quotaOnlyOfferings: FreeQuotaAttestationRequest['quotaOnlyOfferings']) {
    setBusy(true);
    setOutcome(null);
    try {
      const body: FreeQuotaAttestationRequest = { checkedAtMs: 'now', quotaOnlyOfferings };
      const response = await fetch(FREE_QUOTA_ATTESTATION_PATH, {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      const receipt = FreeQuotaAttestationReceiptSchema.parse(await readJsonResponse(response));
      setOutcome({
        tone: 'ok',
        text: `Console check recorded at ${formatEpochMs(receipt.checkedAtMs)}. It covers ${receiptCoverage(receipt.offerings)} and counts until ${formatEpochMs(receipt.freshUntilMs)}.`,
      });
      setConfirmed(false);
      await loadAndSeedForm();
    } catch (error) {
      setOutcome({ tone: 'danger', text: toUserMessage(error, RECORD_FAILED) });
    } finally {
      setBusy(false);
    }
  }

  function requestRecord(current: ConfiguredStatus) {
    if (coverage === null) return;
    const offerings =
      coverage === 'all' ? current.offerings.map((offering) => offering.key) : [...selected];
    if (offerings.length === 0) return;
    const covered =
      coverage === 'all'
        ? `every model listed here (${formatCount(offerings.length)})`
        : `the models you selected (${formatCount(offerings.length)})`;
    confirm({
      title: 'Record the console check?',
      description: `This records that Free quota only is on for ${covered}. A model added to the inventory later is not covered until a new check names it. The server stamps the record with its own clock when you confirm, and it counts for ${formatDurationMs(current.validForMs)}, until about ${formatEpochMs(nowMs + current.validForMs)}. If the switch is off for any of them, usage past that model's free quota bills the provider account at pay-as-you-go prices. The record replaces the current one, cannot be withdrawn here, and is written to the audit log under your account.`,
      confirmLabel: 'Record check',
      destructive: false,
      onConfirm: () => record(offerings),
    });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="free-quota-title">
      <div>
        <h2 id="free-quota-title" className="text-h5">
          Free quota models
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A free quota model serves only while two gates hold: a current terms review in the code,
          and a recent console check by a platform operator that Free quota only is on, so a spent
          allowance stops with an error instead of billing the provider account.
        </p>
      </div>

      {dialog}

      {loadError ? (
        <div className={`${CARD_CLASS} flex flex-col gap-3`}>
          {outcome ? (
            <NoticeLine notice={outcome} role={outcome.tone === 'danger' ? 'alert' : 'status'} />
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm text-danger-text">
              {loadError}
            </p>
            <button type="button" className={ACTION_CLASS} onClick={() => void loadAndSeedForm()}>
              Retry
            </button>
          </div>
        </div>
      ) : status === null ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading the free model gates…</span>
        </div>
      ) : !status.configured ? (
        <div className={`${CARD_CLASS} flex flex-col gap-3`}>
          <NoticeLine
            notice={{
              tone: 'danger',
              text: 'Free models are off: this deployment is missing what they need, so no console check can be recorded yet.',
            }}
          />
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <Requirement
              label="Shared state store (Upstash or Redis)"
              present={status.sharedState}
            />
            <Requirement label="Provider key (QWEN_API_KEY)" present={status.credential} />
            <Requirement
              label={`Free quota inventory (${FREE_POOLS_FILE})`}
              present={status.inventory}
            />
          </dl>
        </div>
      ) : (
        <ConfiguredView
          status={status}
          nowMs={nowMs}
          coverage={coverage}
          selected={selected}
          confirmed={confirmed}
          busy={busy}
          outcome={outcome}
          onCoverage={(next) => chooseCoverage(next, status.offerings)}
          onToggle={toggleOffering}
          onConfirmed={setConfirmed}
          onRecord={() => requestRecord(status)}
        />
      )}
    </section>
  );
}

interface ConfiguredViewProps {
  status: ConfiguredStatus;
  nowMs: number;
  coverage: Coverage | null;
  selected: ReadonlySet<string>;
  confirmed: boolean;
  busy: boolean;
  outcome: Notice | null;
  onCoverage: (coverage: Coverage) => void;
  onToggle: (key: string, on: boolean) => void;
  onConfirmed: (confirmed: boolean) => void;
  onRecord: () => void;
}

function ConfiguredView({
  status,
  nowMs,
  coverage,
  selected,
  confirmed,
  busy,
  outcome,
  onCoverage,
  onToggle,
  onConfirmed,
  onRecord,
}: ConfiguredViewProps) {
  const everyListed = coverage === 'all';
  const canRecord =
    confirmed &&
    !busy &&
    ((coverage === 'all' && status.offerings.length > 0) ||
      (coverage === 'selected' && selected.size > 0));

  return (
    <>
      <ServingSummary status={status} />
      <TermsReviewGate status={status} nowMs={nowMs} />
      <ConsoleCheckGate status={status} nowMs={nowMs} />

      <div className={`${CARD_CLASS} flex flex-col gap-4`}>
        <div>
          <h3 className="text-sm font-medium">Record a console check</h3>
          <ol
            aria-label="Console check steps"
            className="mt-2 flex list-decimal flex-col gap-1.5 ps-5 text-sm"
          >
            <li>
              Sign in to {status.issuer} with the Alibaba Cloud International main account that owns
              this deployment&apos;s key and open the{' '}
              <a
                href={status.consolePage}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK_CLASS}
              >
                Free Tier page
              </a>{' '}
              (from the console home, Special Offer, then My free tier).
            </li>
            <li>
              Turn on Free quota only for every model this record covers: the switch in the Actions
              column for one model, Enable all models at the top right of the table for all of them,
              or tick models and choose Enable selected. It is off by default, and a model left off
              keeps answering after its free quota runs out and bills the account at pay-as-you-go
              prices.
            </li>
            <li>
              Then, with the same account, open the{' '}
              <a
                href={MODEL_STUDIO_FREE_QUOTA_CONSOLE}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK_CLASS}
              >
                Free Quota tab of Model usage
              </a>{' '}
              in the Alibaba Cloud Model Studio console (Singapore) and turn Free Quota Only on
              there for the same models: the switch in the Actions column, or Free Quota Only Batch
              Operation, Batch Enable, then Enable for All Models. This deployment sends its
              requests to the Model Studio International endpoint, and neither console says the two
              switches are one, so turn on both whenever this account can open it.
            </li>
            <li>
              Neither change is immediate, and the QwenCloud page lags by several minutes. Reload
              both pages and confirm every covered model shows the switch on.
            </li>
            <li>
              A model whose free quota is used up or expired has no switch, so it cannot be on.
              Compare the models listed below with the consoles. If a console shows no switch for
              one of them, choose Only the models I select and untick it: a model left out stays off
              here, while one recorded as on with its switch off bills the account once its quota is
              gone.
            </li>
            <li>
              Record it here within {formatDurationMs(status.recordWindowMs)} of checking. The
              server stamps the record with its own clock when you confirm, and it counts for{' '}
              {formatDurationMs(status.validForMs)}.
            </li>
          </ol>
          <div className="mt-2 text-xs text-muted-foreground">
            <p>Sources:</p>
            <ul className="mt-1 flex flex-col gap-1">
              <li>
                <a
                  href={QWENCLOUD_FREE_QUOTA_DOC}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASS}
                >
                  QwenCloud, Free quota
                </a>
              </li>
              <li>
                <a
                  href={MODEL_STUDIO_FREE_QUOTA_DOC}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASS}
                >
                  Alibaba Cloud Model Studio, Free quota for new users
                </a>
              </li>
            </ul>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="text-sm font-medium">Models this check covers</legend>
          <label className={CHOICE_CLASS}>
            <input
              type="radio"
              name="free-quota-coverage"
              className={INPUT_CLASS}
              checked={coverage === 'all'}
              onChange={() => onCoverage('all')}
            />
            <span>
              Every model listed here ({formatCount(status.offerings.length)}): Free quota only is
              on for all of them
            </span>
          </label>
          <label className={CHOICE_CLASS}>
            <input
              type="radio"
              name="free-quota-coverage"
              className={INPUT_CLASS}
              checked={coverage === 'selected'}
              onChange={() => onCoverage('selected')}
            />
            <span>Only the models I select</span>
          </label>
          <div
            role="group"
            aria-label="Models confirmed in the console"
            className="max-h-72 overflow-y-auto rounded-xl border border-border p-3"
          >
            {status.offerings.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No inventory model can be served from the free quota.
              </p>
            ) : (
              status.offerings.map((offering) => (
                <label key={offering.key} className={CHOICE_CLASS}>
                  <input
                    type="checkbox"
                    className={INPUT_CLASS}
                    checked={everyListed || selected.has(offering.key)}
                    disabled={everyListed}
                    onChange={(event) => onToggle(offering.key, event.target.checked)}
                  />
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="break-all font-mono text-xs">{offering.providerModelId}</span>
                    <span className="text-xs text-muted-foreground">
                      {FREE_QUOTA_CATEGORIES[offering.category]}
                      {offering.expiresOn ? `, free quota ends ${offering.expiresOn}` : ''}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatCount(everyListed ? status.offerings.length : selected.size)} selected
          </p>
        </fieldset>

        <label className={CHOICE_CLASS}>
          <input
            type="checkbox"
            className={INPUT_CLASS}
            checked={confirmed}
            disabled={busy}
            onChange={(event) => onConfirmed(event.target.checked)}
          />
          <span>
            I checked just now that Free quota only is on for every model this record covers, on the{' '}
            {status.issuer} Free Tier page and, where this account can open it, in the Model Studio
            Free Quota tab.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={ACTION_CLASS} disabled={!canRecord} onClick={onRecord}>
            {busy ? 'Recording…' : 'Record console check'}
          </button>
          {busy ? <Spinner size="sm" /> : null}
        </div>

        {outcome ? (
          <NoticeLine notice={outcome} role={outcome.tone === 'danger' ? 'alert' : 'status'} />
        ) : null}
      </div>
    </>
  );
}

function ServingSummary({ status }: { status: ConfiguredStatus }) {
  const { serving } = status;
  return (
    <div className={`${CARD_CLASS} flex flex-col gap-3`}>
      <NoticeLine notice={servingNotice(status)} />
      <p className="text-sm">
        Serving now: {formatCount(serving.ready)} of {formatCount(serving.total)} inventory models
      </p>
      {serving.blocked.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs" aria-label="Why the rest are not serving">
          {serving.blocked.map((entry) => (
            <li key={entry.outcome} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{OUTCOME_LABEL[entry.outcome]}</span>
              <span className="tabular-nums">{formatCount(entry.count)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TermsReviewGate({ status, nowMs }: { status: ConfiguredStatus; nowMs: number }) {
  const { review } = status.termsReview;
  const left = review ? review.expiresAtMs - nowMs : null;
  return (
    <div className={CARD_CLASS} aria-labelledby="free-quota-terms-title" role="group">
      <h3 id="free-quota-terms-title" className="mb-3 text-sm font-medium">
        Terms review
      </h3>
      <NoticeLine notice={termsNotice(status, nowMs)} />
      {review ? (
        <dl className={DETAILS_CLASS}>
          <dt className="text-muted-foreground">Reviewed by</dt>
          <dd>{review.reviewedBy}</dd>
          <dt className="text-muted-foreground">Reviewed on</dt>
          <dd>{formatEpochMs(review.verifiedAtMs)}</dd>
          <dt className="text-muted-foreground">Valid until</dt>
          <dd>
            {formatEpochMs(review.expiresAtMs)} (
            {left !== null && left > 0 ? `${formatDurationMs(left)} left` : 'ran out'})
          </dd>
          <dt className="text-muted-foreground">Models it clears</dt>
          <dd>{formatCount(review.approvedOfferings)}</dd>
          {(Object.keys(TERM_LABEL) as Array<keyof FreeQuotaTerms>).map((term) => (
            <TermRow key={term} label={TERM_LABEL[term]} allowed={review.terms[term]} />
          ))}
          <dt className="text-muted-foreground">Evidence</dt>
          <dd className="break-all">
            <a
              href={review.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              {review.evidenceUrl}
            </a>
          </dd>
        </dl>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Recording or renewing the review is a reviewed change to {FREE_POOLS_FILE} and a deploy, not
        an action on this page. The steps are in {RUNBOOK_FILE}.
      </p>
    </div>
  );
}

function TermRow({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={allowed ? 'text-foreground' : 'font-medium text-danger-text'}>
        {allowed ? 'Yes' : 'No'}
      </dd>
    </>
  );
}

function ConsoleCheckGate({ status, nowMs }: { status: ConfiguredStatus; nowMs: number }) {
  const { record } = status.attestation;
  const left = record ? record.freshUntilMs - nowMs : null;
  return (
    <div className={CARD_CLASS} aria-labelledby="free-quota-check-title" role="group">
      <h3 id="free-quota-check-title" className="mb-3 text-sm font-medium">
        Console check
      </h3>
      <NoticeLine notice={attestationNotice(status, nowMs)} />
      <dl className={DETAILS_CLASS}>
        <dt className="text-muted-foreground">Last console check</dt>
        <dd>{record ? formatEpochMs(record.checkedAtMs) : 'None recorded'}</dd>
        <dt className="text-muted-foreground">Valid until</dt>
        <dd>
          {record
            ? `${formatEpochMs(record.freshUntilMs)} (${
                left !== null && left > 0 ? `${formatDurationMs(left)} left` : 'ran out'
              })`
            : 'None recorded'}
        </dd>
        <dt className="text-muted-foreground">Provider key</dt>
        <dd>
          {record
            ? record.boundToCurrentKey
              ? 'The key this deployment uses'
              : 'A different key than this deployment uses'
            : 'None recorded'}
        </dd>
        <dt className="text-muted-foreground">Models covered</dt>
        <dd>{coveredModels(status)}</dd>
        <dt className="text-muted-foreground">Recorded by</dt>
        <dd className="break-all font-mono text-xs">
          {record ? record.attestedBy : 'None recorded'}
        </dd>
        <dt className="text-muted-foreground">Billing signal</dt>
        <dd>{billingSignalText(status)}</dd>
        <dt className="text-muted-foreground">Withdrawn models</dt>
        <dd>
          {status.withdrawn.length === 0 ? (
            'None'
          ) : (
            <ul className="flex flex-col gap-1">
              {status.withdrawn.map((held) => (
                <li key={held.key}>
                  <span className="font-mono text-xs">{held.displayName}</span>:{' '}
                  {WITHDRAWN_CAUSE[held.cause]}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </div>
  );
}
