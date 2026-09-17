'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import type { RolloutSlotView } from '@/app/api/admin/model-rollout/route';
import type { ModelBenchmarkRow } from '@/lib/services/model-rollout/rollout-evaluation-service';
import { formatDateTime, formatRate, NONE } from '../lib/operator-format';

const ROLLOUT_ENDPOINT = '/api/admin/model-rollout';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';

interface RolloutView {
  stages: { observedHealth: boolean; canary: boolean; shadow: boolean };
  slots: RolloutSlotView[];
  benchmarks: ModelBenchmarkRow[];
}

const STAGE_LABEL: Record<keyof RolloutView['stages'], string> = {
  observedHealth: 'Observed-health ranking',
  canary: 'Canary serving',
  shadow: 'Shadow mirroring',
};

export default function ModelRolloutPanel() {
  const [view, setView] = useState<RolloutView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(ROLLOUT_ENDPOINT, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
      }
      setView(body as RolloutView);
    } catch (loadError) {
      setError(toUserMessage(loadError, 'Could not read the rollout state.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="model-rollout-title">
      <div>
        <h2 id="model-rollout-title" className="text-sm font-medium">
          Model rollout
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Which rollout stages this deployment runs, the slots that declare a canary or a shadow,
          and what each candidate measured per lifecycle stage. Cohort regressions in quality,
          latency or cost page on call; a candidate is pulled with the kill switch on its routing
          flag.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : view === null ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading rollout state…</span>
        </div>
      ) : (
        <>
          <div className={CARD_CLASS}>
            <dl className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(STAGE_LABEL) as (keyof RolloutView['stages'])[]).map((stage) => (
                <div key={stage}>
                  <dt className="text-xs text-muted-foreground">{STAGE_LABEL[stage]}</dt>
                  <dd className="mt-1 text-sm">{view.stages[stage] ? 'On' : 'Withdrawn'}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-card text-left">
                <tr>
                  <th className="p-3 font-medium">Slot</th>
                  <th className="p-3 font-medium">Promoted</th>
                  <th className="p-3 font-medium">Canary</th>
                  <th className="p-3 font-medium">Traffic</th>
                  <th className="p-3 font-medium">Shadow</th>
                  <th className="p-3 font-medium">Daily cap</th>
                </tr>
              </thead>
              <tbody>
                {view.slots.length === 0 ? (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={6}>
                      No routing slot declares a canary or a shadow, so every request serves the
                      promoted model.
                    </td>
                  </tr>
                ) : null}
                {view.slots.map((slot) => (
                  <tr key={slot.slotId} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">{slot.slotId}</td>
                    <td className="p-3 font-mono text-xs">{slot.modelKey}</td>
                    <td className="p-3 font-mono text-xs">{slot.canaryModelKey ?? NONE}</td>
                    <td className="p-3 tabular-nums">
                      {slot.canaryTrafficFraction === null
                        ? NONE
                        : formatRate(slot.canaryTrafficFraction)}
                    </td>
                    <td className="p-3 font-mono text-xs">{slot.shadowModelKey ?? NONE}</td>
                    <td className="p-3 tabular-nums">{slot.shadowDailyRequestCap ?? NONE}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-card text-left">
                <tr>
                  <th className="p-3 font-medium">Model</th>
                  <th className="p-3 font-medium">Lifecycle stage</th>
                  <th className="p-3 font-medium">Cohort</th>
                  <th className="p-3 font-medium">Requests</th>
                  <th className="p-3 font-medium">Failure rate</th>
                  <th className="p-3 font-medium">Latency p50</th>
                  <th className="p-3 font-medium">Cost/request</th>
                  <th className="p-3 font-medium">Window</th>
                </tr>
              </thead>
              <tbody>
                {view.benchmarks.length === 0 ? (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={8}>
                      Nothing has been measured yet. A row appears for each model and cohort once
                      the hourly rollout evaluation sees traffic.
                    </td>
                  </tr>
                ) : null}
                {view.benchmarks.map((row) => (
                  <tr
                    key={`${row.modelKey}:${row.cohort}:${row.slotId ?? ''}:${row.windowStart}`}
                    className="border-t border-border"
                  >
                    <td className="p-3 font-mono text-xs">{row.modelKey}</td>
                    <td className="p-3 text-xs">{row.lifecycleStage}</td>
                    <td className="p-3 text-xs">{row.cohort}</td>
                    <td className="p-3 tabular-nums">{row.sampleCount}</td>
                    <td className="p-3 tabular-nums">
                      {row.failureRate === null ? NONE : formatRate(row.failureRate)}
                    </td>
                    <td className="p-3 tabular-nums">{row.latencyP50Ms ?? NONE}</td>
                    <td className="p-3 tabular-nums">{row.costPerRequestMicrousd ?? NONE}</td>
                    <td className="p-3 text-xs">{formatDateTime(row.windowEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
