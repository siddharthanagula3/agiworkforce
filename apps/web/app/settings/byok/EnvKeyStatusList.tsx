'use client';

import { useEffect, useState } from 'react';
import type { ByokProvider } from '@/lib/byok-providers';

interface ProviderStatus {
  id: string;
  envVar: string;
  isSet: boolean;
}

interface ApiResponse {
  providers: ProviderStatus[];
}

/** Icon abbreviation cell — consistent with connections page pattern */
function ProviderIcon({ text }: { text: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: 'var(--bg-base)',
        border: '1px solid var(--settings-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-3)',
        flexShrink: 0,
        letterSpacing: '0.02em',
      }}
    >
      {text}
    </div>
  );
}

function StatusBadge({ isSet }: { isSet: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 100,
        fontSize: 11,
        fontWeight: 600,
        background: isSet
          ? 'color-mix(in srgb, var(--teal, #2eb88a) 12%, transparent)'
          : 'var(--bg-elev)',
        color: isSet ? 'var(--teal, #2eb88a)' : 'var(--text-3)',
        border: isSet
          ? '1px solid color-mix(in srgb, var(--teal, #2eb88a) 30%, transparent)'
          : '1px solid var(--settings-border)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: isSet ? 'var(--teal, #2eb88a)' : 'var(--text-3)',
          flexShrink: 0,
        }}
      />
      {isSet ? 'Set' : 'Not set'}
    </span>
  );
}

interface Props {
  /** Static provider list from server (label, iconText, envVar). No key values. */
  providers: ReadonlyArray<ByokProvider>;
}

export function EnvKeyStatusList({ providers }: Props) {
  const [statuses, setStatuses] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/byok/env-key-status');
        if (!res.ok) throw new Error('status fetch failed');
        const data: ApiResponse = await res.json();
        if (cancelled) return;
        const map = new Map<string, boolean>();
        for (const entry of data.providers) {
          map.set(entry.id, entry.isSet);
        }
        setStatuses(map);
      } catch {
        // Silently fail — statuses remain unknown (neither Set nor Not set shown)
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      aria-label="API key status by provider"
      style={{
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        overflow: 'hidden',
      }}
    >
      {providers.map((provider, idx) => {
        const isSet = statuses.get(provider.id);
        return (
          <div
            key={provider.id}
            style={{
              padding: '12px 18px',
              borderTop: idx === 0 ? 'none' : '1px solid var(--settings-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            {/* Icon + name + env var */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ProviderIcon text={provider.iconText} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                  {provider.label}
                  {provider.pendingAdapter && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--text-3)',
                        padding: '1px 5px',
                        border: '1px solid var(--settings-border)',
                        borderRadius: 4,
                        verticalAlign: 'middle',
                      }}
                    >
                      adapter pending
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--mono)',
                    color: 'var(--text-3)',
                  }}
                >
                  {provider.envVar}
                </span>
              </div>
            </div>

            {/* Status badge — only presence, never value */}
            {loading ? (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Checking...</span>
            ) : (
              <StatusBadge isSet={Boolean(isSet)} />
            )}
          </div>
        );
      })}
    </section>
  );
}
