'use client';

import { useEffect, useId, useState } from 'react';
import { Button, Switch, useConfirmAction } from '@agiworkforce/ui';
import {
  AUTO_RELOAD_CONSENT_VERSION,
  AUTO_RELOAD_DEFAULT_THRESHOLD_CREDITS,
  AUTO_RELOAD_EXTRA_DISCOUNT_PERCENT,
  AUTO_RELOAD_MAX_THRESHOLD_CREDITS,
  AUTO_RELOAD_MIN_THRESHOLD_CREDITS,
  TOP_UP_PRESET_AMOUNTS_USD,
  autoReloadConsentText,
  formatCredits,
  isAutoReloadThresholdCredits,
  quoteTopUp,
  type TopUpQuote,
} from '@agiworkforce/types';
import { toUserMessage } from '@/lib/user-error-message';
import type { AutoReloadSettings, AutoReloadUpdate } from '../lib/billing-account-types';
import { formatBillingDate, formatBillingMoney } from '../lib/billing-format';
import {
  PaymentMethodRequiredError,
  fetchAutoReload,
  saveAutoReload,
} from '../services/billing-account';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; saved: AutoReloadSettings }
  | { status: 'error'; message: string };

interface Draft {
  enabled: boolean;
  threshold: string;
  pack: number | 'other';
  otherAmount: string;
}

const PRESETS: readonly number[] = TOP_UP_PRESET_AMOUNTS_USD;

function draftFrom(settings: AutoReloadSettings): Draft {
  const preset = PRESETS.includes(settings.amountUsd);
  return {
    enabled: settings.enabled,
    threshold: String(settings.thresholdCredits),
    pack: preset ? settings.amountUsd : 'other',
    otherAmount: preset ? '' : String(settings.amountUsd),
  };
}

function reloadPrice(quote: TopUpQuote): string {
  return formatBillingMoney(quote.priceCents, 'usd', { trimWholeUnits: true });
}

function describeCard(card: AutoReloadSettings['paymentMethod']): string | null {
  if (!card) return null;
  return `${card.brand.charAt(0).toUpperCase()}${card.brand.slice(1)} ending in ${card.last4}`;
}

export function AutoReloadPanel({
  onAddPaymentMethod,
  portalPending,
}: {
  onAddPaymentMethod: () => void;
  portalPending: boolean;
}) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCard, setNeedsCard] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { confirm, dialog } = useConfirmAction();
  const titleId = useId();
  const thresholdId = useId();
  const thresholdHintId = useId();
  const packId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    fetchAutoReload()
      .then((saved) => {
        if (cancelled) return;
        setLoad({ status: 'ready', saved });
        setDraft(draftFrom(saved));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLoad({
          status: 'error',
          message: toUserMessage(cause, 'Your auto-reload settings could not be loaded.'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const heading = (
    <h2 id={titleId} className="text-[13px] font-semibold text-[color:var(--text-2)]">
      Auto-reload
    </h2>
  );

  if (load.status !== 'ready' || !draft) {
    return (
      <section aria-labelledby={titleId} className="flex flex-col gap-2">
        {heading}
        {load.status === 'error' ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-destructive-text">{load.message}</span>
            <Button
              size="sm"
              variant="outline"
              className="pointer-coarse:h-11"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        ) : (
          <p role="status" className="text-[13px] text-muted-foreground">
            Loading auto-reload…
          </p>
        )}
      </section>
    );
  }

  const saved = load.saved;
  const amountUsd = draft.pack === 'other' ? Number(draft.otherAmount) : draft.pack;
  const quote = quoteTopUp(amountUsd, { autoReload: true });
  const threshold = Number(draft.threshold);
  const thresholdValid = isAutoReloadThresholdCredits(threshold);
  const dirty =
    saved.enabled !== draft.enabled ||
    saved.thresholdCredits !== threshold ||
    saved.amountUsd !== amountUsd;
  const canSave = dirty && !saving && (!draft.enabled || (quote !== null && thresholdValid));
  const card = describeCard(saved.paymentMethod);
  const lastFailureOn = formatBillingDate(saved.lastFailure?.at);
  const consentedOn = saved.enabled ? formatBillingDate(saved.consent?.acceptedAt) : null;

  async function persist(update: AutoReloadUpdate) {
    setSaving(true);
    setError(null);
    setNeedsCard(false);
    try {
      const next = await saveAutoReload(update);
      setLoad({ status: 'ready', saved: next });
      setDraft(draftFrom(next));
    } catch (cause) {
      setNeedsCard(cause instanceof PaymentMethodRequiredError);
      setError(toUserMessage(cause, 'Your auto-reload settings were not saved.'));
    } finally {
      setSaving(false);
    }
  }

  function toggle(enabled: boolean) {
    if (!draft) return;
    if (!enabled && saved.enabled) {
      void persist({
        enabled: false,
        thresholdCredits: saved.thresholdCredits,
        amountUsd: saved.amountUsd,
      });
      return;
    }
    setDraft({ ...draft, enabled });
  }

  function save() {
    if (!canSave || !draft) return;
    if (!draft.enabled || !quote) {
      void persist({
        enabled: false,
        thresholdCredits: thresholdValid ? threshold : saved.thresholdCredits,
        amountUsd: quote ? quote.amountUsd : saved.amountUsd,
      });
      return;
    }
    const consentText = saved.paymentMethod
      ? autoReloadConsentText({
          amountUsd: quote.amountUsd,
          thresholdCredits: threshold,
          card: saved.paymentMethod,
        })
      : null;
    if (!consentText) {
      setNeedsCard(true);
      setError('Add a card before turning on auto-reload.');
      return;
    }
    const update: AutoReloadUpdate = {
      enabled: true,
      thresholdCredits: threshold,
      amountUsd: quote.amountUsd,
      consentVersion: AUTO_RELOAD_CONSENT_VERSION,
    };
    confirm({
      title: saved.enabled ? 'Change auto-reload?' : 'Turn on auto-reload?',
      description: consentText,
      confirmLabel: saved.enabled ? 'Agree and save' : 'Agree and turn on',
      destructive: false,
      onConfirm: () => persist(update),
    });
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {heading}
          <p className="mt-1 text-[13px] text-muted-foreground">
            Buy credits automatically when your balance runs low. Auto-reload takes an extra{' '}
            {AUTO_RELOAD_EXTRA_DISCOUNT_PERCENT}% off the pack price.
          </p>
        </div>
        <Switch
          aria-labelledby={titleId}
          checked={draft.enabled}
          disabled={saving}
          onCheckedChange={toggle}
        />
      </div>

      {consentedOn ? (
        <p className="text-[13px] text-muted-foreground">
          You agreed to the auto-reload terms on {consentedOn}.
        </p>
      ) : null}

      {draft.enabled ? (
        <div className="flex flex-col gap-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={thresholdId}>When my balance falls below</label>
            <input
              id={thresholdId}
              type="number"
              inputMode="numeric"
              min={AUTO_RELOAD_MIN_THRESHOLD_CREDITS}
              max={AUTO_RELOAD_MAX_THRESHOLD_CREDITS}
              step={1}
              placeholder={String(AUTO_RELOAD_DEFAULT_THRESHOLD_CREDITS)}
              value={draft.threshold}
              aria-invalid={!thresholdValid}
              aria-describedby={thresholdValid ? undefined : thresholdHintId}
              onChange={(event) => setDraft({ ...draft, threshold: event.target.value })}
              className="h-9 w-28 rounded-md border border-border bg-background px-2 tabular-nums pointer-coarse:h-11"
            />
            <span>credits</span>
          </div>
          {thresholdValid ? null : (
            <p id={thresholdHintId} className="text-destructive-text">
              Choose a balance from {formatCredits(AUTO_RELOAD_MIN_THRESHOLD_CREDITS)} to{' '}
              {formatCredits(AUTO_RELOAD_MAX_THRESHOLD_CREDITS)}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={packId}>Reload with</label>
            <select
              id={packId}
              value={draft.pack === 'other' ? 'other' : String(draft.pack)}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  pack: event.target.value === 'other' ? 'other' : Number(event.target.value),
                })
              }
              className="h-9 rounded-md border border-border bg-background px-2 pointer-coarse:h-11"
            >
              {PRESETS.map((presetUsd) => {
                const preset = quoteTopUp(presetUsd, { autoReload: true });
                return preset ? (
                  <option key={presetUsd} value={String(presetUsd)}>
                    {formatCredits(preset.credits)} for {reloadPrice(preset)}
                  </option>
                ) : null;
              })}
              <option value="other">Other amount</option>
            </select>
            {draft.pack === 'other' ? (
              <label className="flex items-center gap-1.5">
                <span className="text-muted-foreground" aria-hidden="true">
                  $
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  value={draft.otherAmount}
                  onChange={(event) => setDraft({ ...draft, otherAmount: event.target.value })}
                  aria-label="Reload amount in US dollars"
                  className="h-9 w-24 rounded-md border border-border bg-background px-2 tabular-nums pointer-coarse:h-11"
                />
              </label>
            ) : null}
          </div>
          <p aria-live="polite" className="tabular-nums">
            {quote ? (
              <>
                Each reload: {formatCredits(quote.credits)} for {reloadPrice(quote)} plus tax,{' '}
                {quote.discountPercent}% off
                {card ? `, charged to ${card}` : ''}.
              </>
            ) : (
              <span className="text-muted-foreground">
                Choose a pack or enter a whole-dollar amount.
              </span>
            )}
          </p>
        </div>
      ) : null}

      {saved.lastFailure ? (
        <p role="alert" className="text-[13px] text-destructive-text">
          The last reload{lastFailureOn ? ` on ${lastFailureOn}` : ''} did not go through:{' '}
          {saved.lastFailure.reason.trim().replace(/\.?$/, '.')}
          {saved.enabled ? '' : ' Auto-reload stays off until you turn it on again.'}
        </p>
      ) : null}

      {(draft.enabled && !saved.paymentMethod) || needsCard ? (
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-muted-foreground">Auto-reload charges a saved card.</span>
          <Button
            size="sm"
            variant="outline"
            className="pointer-coarse:h-11"
            onClick={onAddPaymentMethod}
            disabled={portalPending}
            isLoading={portalPending}
          >
            Add a payment method
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[13px] text-destructive-text">
          {error}
        </p>
      ) : null}

      {dirty ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="pointer-coarse:h-11"
            onClick={save}
            disabled={!canSave}
            isLoading={saving}
          >
            Save auto-reload
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="pointer-coarse:h-11"
            onClick={() => {
              setDraft(draftFrom(saved));
              setError(null);
            }}
            disabled={saving}
          >
            Discard changes
          </Button>
        </div>
      ) : null}

      {dialog}
    </section>
  );
}
