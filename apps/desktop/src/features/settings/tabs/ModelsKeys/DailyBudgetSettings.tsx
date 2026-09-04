import React from 'react';
import { Loader2 } from 'lucide-react';

import { invoke, isTauri } from '@/lib/tauri-mock';
import { Button } from '@/ui/Button';
import { BudgetStatusWidget } from '@/features/layout';

interface BudgetStatus {
  spent_usd: number;
  cap_usd: number;
  remaining_usd: number;
}

const CAP_STEP_USD = '0.01';
const MIN_CAP_USD = '0';

/**
 * The daily cap is the only spend ceiling that survives a restart, the
 * router's session cap resets with every run, so it is the control that
 * bounds an autonomous loop replaying against the keys entered above.
 */
export function DailyBudgetSettings() {
  const [capInput, setCapInput] = React.useState('');
  const [status, setStatus] = React.useState<BudgetStatus | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await invoke<BudgetStatus>('budget_get_status');
        if (cancelled) return;
        setStatus(next);
        setCapInput(next.cap_usd.toFixed(2));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isTauri) return null;

  const parsedCap = Number(capInput);
  const capIsValid = capInput.trim() !== '' && Number.isFinite(parsedCap) && parsedCap >= 0;
  const isDirty = status !== null && parsedCap !== status.cap_usd;

  const saveCap = async (): Promise<void> => {
    if (!capIsValid) return;
    setSaving(true);
    setError(null);
    try {
      const applied = await invoke<number>('budget_set_cap_usd', { newCapUsd: parsedCap });
      setCapInput(applied.toFixed(2));
      setStatus(await invoke<BudgetStatus>('budget_get_status'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-6 border-t border-border">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Daily Spend Cap</h3>
          <p className="text-sm text-muted-foreground">
            Refuses new model calls once the day&apos;s spend against your own keys reaches this
            amount. Resets at 00:00 UTC.
          </p>
        </div>
        <BudgetStatusWidget />
      </div>

      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Cap (USD per day)</span>
          <input
            type="number"
            inputMode="decimal"
            min={MIN_CAP_USD}
            step={CAP_STEP_USD}
            value={capInput}
            onChange={(event) => setCapInput(event.target.value)}
            className="w-40 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <Button
          size="sm"
          onClick={() => void saveCap()}
          disabled={!capIsValid || !isDirty || saving}
        >
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Save cap
        </Button>
      </div>

      {!capIsValid && capInput.trim() !== '' ? (
        <p className="mt-2 text-xs text-destructive">Enter a non-negative amount.</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      {status ? (
        <p className="mt-2 text-xs text-muted-foreground">
          ${status.spent_usd.toFixed(4)} spent today, ${status.remaining_usd.toFixed(2)} remaining.
        </p>
      ) : null}
    </div>
  );
}
