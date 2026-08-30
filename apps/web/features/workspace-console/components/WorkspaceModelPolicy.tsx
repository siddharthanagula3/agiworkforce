'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, CircleSlash } from 'lucide-react';

import {
  useModelPolicy,
  useUpdateModelPolicy,
  type CatalogModel,
  type ModelPolicyLists,
} from '../hooks/use-model-policy';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

/**
 * What one entry resolves to, mirroring the evaluator's precedence.
 *
 * The console must show what a MEMBER will actually experience, not what the
 * administrator typed. A model on the approved list whose provider is blocked
 * is still usable — that is deliberate, so "no Provider X except this model" is
 * expressible — and a console that showed it as blocked would send an admin
 * hunting for a bug that is not there.
 */
type Effective = 'allowed' | 'blocked' | 'not-approved';

function effectiveFor(model: CatalogModel, lists: ModelPolicyLists): Effective {
  const id = model.id.toLowerCase();
  const provider = model.provider.toLowerCase();
  const has = (list: string[], value: string) =>
    list.some((entry) => entry.trim().toLowerCase() === value);

  if (has(lists.blockedModels, id)) return 'blocked';
  if (has(lists.allowedModels, id)) return 'allowed';
  if (has(lists.blockedProviders, provider)) return 'blocked';
  if (lists.allowedModels.length > 0) return 'not-approved';
  if (lists.allowedProviders.length > 0 && !has(lists.allowedProviders, provider)) {
    return 'not-approved';
  }
  return 'allowed';
}

function EffectiveChip({ state }: { state: Effective }) {
  const copy: Record<Effective, { text: string; alarming: boolean }> = {
    allowed: { text: 'Available', alarming: false },
    blocked: { text: 'Blocked', alarming: true },
    'not-approved': { text: 'Not approved', alarming: true },
  };
  const { text, alarming } = copy[state];

  return (
    <span
      className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]"
      style={{
        color: alarming ? 'var(--settings-destructive-text)' : 'var(--text-3)',
        borderColor: alarming ? 'currentColor' : 'var(--settings-border)',
      }}
    >
      {text}
    </span>
  );
}

function toggle(list: string[], value: string): string[] {
  const lower = value.toLowerCase();
  return list.some((entry) => entry.toLowerCase() === lower)
    ? list.filter((entry) => entry.toLowerCase() !== lower)
    : [...list, lower];
}

export function WorkspaceModelPolicy() {
  const { data, isPending, isError, error, refetch } = useModelPolicy();
  const update = useUpdateModelPolicy();

  const [draft, setDraft] = useState<ModelPolicyLists | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!data) return;
    setDraft({
      allowedProviders: [...data.policy.allowedProviders],
      blockedProviders: [...data.policy.blockedProviders],
      allowedModels: [...data.policy.allowedModels],
      blockedModels: [...data.policy.blockedModels],
    });
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    const saved: ModelPolicyLists = {
      allowedProviders: data.policy.allowedProviders,
      blockedProviders: data.policy.blockedProviders,
      allowedModels: data.policy.allowedModels,
      blockedModels: data.policy.blockedModels,
    };
    const norm = (l: ModelPolicyLists) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(l).map(([k, v]) => [
            k,
            [...(v as string[])].map((s) => s.toLowerCase()).sort(),
          ]),
        ),
      );
    return norm(saved) !== norm(draft);
  }, [data, draft]);

  if (isPending) {
    return (
      <div
        role="status"
        style={{ ...cardStyle, padding: 20, color: 'var(--text-3)', fontSize: 13 }}
      >
        Loading model policy…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load your model policy
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null || !draft) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          Model governance is not available for this workspace
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          It needs a Team or Enterprise workspace, and an owner or admin role to change.
        </p>
      </div>
    );
  }

  const canEdit = data.canManagePolicy && !update.isPending;
  const restricted =
    draft.allowedProviders.length +
      draft.blockedProviders.length +
      draft.allowedModels.length +
      draft.blockedModels.length >
    0;

  const visible = data.catalog.models.filter((model) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return true;
    return (
      model.name.toLowerCase().includes(needle) ||
      model.id.toLowerCase().includes(needle) ||
      model.provider.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <section style={cardStyle} aria-labelledby="providers-heading">
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
          <h2
            id="providers-heading"
            className="text-sm font-semibold"
            style={{ color: 'var(--text-1)' }}
          >
            Providers
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Blocking a provider blocks every model it serves, unless you approve a specific model
            below. Approving no providers at all leaves them all available — restriction is
            something you say, not something an empty list implies.
          </p>
        </div>
        <ul className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
          {data.catalog.providers.map((provider) => {
            const allowed = draft.allowedProviders.some((p) => p.toLowerCase() === provider);
            const blocked = draft.blockedProviders.some((p) => p.toLowerCase() === provider);
            return (
              <li
                key={provider}
                className="flex items-center justify-between gap-3 px-5 py-3"
                style={{ borderColor: 'var(--settings-border)' }}
              >
                <span className="text-sm" style={{ color: 'var(--text-1)' }}>
                  {provider.replace(/_/g, ' ')}
                </span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={allowed}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        allowedProviders: toggle(draft.allowedProviders, provider),
                        blockedProviders: draft.blockedProviders.filter(
                          (p) => p.toLowerCase() !== provider,
                        ),
                      })
                    }
                    className="rounded-md border px-2.5 py-1 text-[11px] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    style={{
                      borderColor: allowed ? 'currentColor' : 'var(--settings-border)',
                      color: allowed ? 'var(--text-1)' : 'var(--text-3)',
                    }}
                  >
                    <Check aria-hidden className="mr-1 inline h-3 w-3" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={blocked}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        blockedProviders: toggle(draft.blockedProviders, provider),
                        allowedProviders: draft.allowedProviders.filter(
                          (p) => p.toLowerCase() !== provider,
                        ),
                      })
                    }
                    className="rounded-md border px-2.5 py-1 text-[11px] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    style={{
                      borderColor: blocked ? 'currentColor' : 'var(--settings-border)',
                      color: blocked ? 'var(--settings-destructive-text)' : 'var(--text-3)',
                    }}
                  >
                    <Ban aria-hidden className="mr-1 inline h-3 w-3" />
                    Block
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section style={cardStyle} aria-labelledby="models-heading">
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5"
          style={{ borderColor: 'var(--settings-border)' }}
        >
          <div className="min-w-0">
            <h2
              id="models-heading"
              className="text-sm font-semibold"
              style={{ color: 'var(--text-1)' }}
            >
              Models
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
              The badge shows what a member will actually get, after every rule resolves.
            </p>
          </div>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter models"
            aria-label="Filter models"
            style={{
              minHeight: 30,
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-base)',
              color: 'var(--text-1)',
              fontSize: 12,
              padding: '4px 8px',
            }}
          />
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <CircleSlash aria-hidden className="h-5 w-5" style={{ color: 'var(--text-3)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
              No model matches “{filter}”
            </p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
            {visible.map((model) => {
              const state = effectiveFor(model, draft);
              const explicitlyBlocked = draft.blockedModels.some(
                (m) => m.toLowerCase() === model.id.toLowerCase(),
              );
              const explicitlyAllowed = draft.allowedModels.some(
                (m) => m.toLowerCase() === model.id.toLowerCase(),
              );
              return (
                <li
                  key={model.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                  style={{ borderColor: 'var(--settings-border)' }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm" style={{ color: 'var(--text-1)' }}>
                      {model.name}
                    </span>
                    <span className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {model.provider.replace(/_/g, ' ')}
                      {model.live ? '' : ' · not live'}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <EffectiveChip state={state} />
                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={explicitlyAllowed}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          allowedModels: toggle(draft.allowedModels, model.id),
                          blockedModels: draft.blockedModels.filter(
                            (m) => m.toLowerCase() !== model.id.toLowerCase(),
                          ),
                        })
                      }
                      className="rounded-md border px-2.5 py-1 text-[11px] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      style={{
                        borderColor: explicitlyAllowed ? 'currentColor' : 'var(--settings-border)',
                        color: explicitlyAllowed ? 'var(--text-1)' : 'var(--text-3)',
                      }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={explicitlyBlocked}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          blockedModels: toggle(draft.blockedModels, model.id),
                          allowedModels: draft.allowedModels.filter(
                            (m) => m.toLowerCase() !== model.id.toLowerCase(),
                          ),
                        })
                      }
                      className="rounded-md border px-2.5 py-1 text-[11px] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      style={{
                        borderColor: explicitlyBlocked ? 'currentColor' : 'var(--settings-border)',
                        color: explicitlyBlocked
                          ? 'var(--settings-destructive-text)'
                          : 'var(--text-3)',
                      }}
                    >
                      Block
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
          style={{ borderColor: 'var(--settings-border)' }}
        >
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            {restricted
              ? 'This workspace restricts models. The rule is checked after auto-routing resolves, so a blocked model cannot be reached by asking for Auto.'
              : 'No restriction is in force. Every model in the catalog is available to members.'}
          </p>
          <div className="flex items-center gap-3">
            {update.isError ? (
              <span className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
                {update.error.message}
              </span>
            ) : null}
            <button
              type="button"
              disabled={!canEdit || !dirty}
              onClick={() => update.mutate(draft)}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {update.isPending ? 'Saving…' : 'Save model policy'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
