'use client';

import { useEffect, useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useBillingStore } from '@/stores/unified/auth';
import { Progress } from '@shared/ui/progress';

/**
 * /settings/usage — Plan usage limits with progress bars per model tier.
 * UI reference: desktop/claude/2026-05-13/extended/028-settings-usage.png
 *
 * Uses mock data for weekly limits since no real usage API is wired yet.
 * Structure: current-session bar, weekly limits (3 bars), daily routine runs.
 */

// Next Wednesday reset label (computed from current date)
function getNextResetLabel(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 3=Wed
  const daysUntilWed = (3 - dayOfWeek + 7) % 7 || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilWed);
  return next.toLocaleDateString('en-US', { weekday: 'short' });
}

interface UsageLimitBar {
  label: string;
  percentUsed: number;
  resetsLabel: string;
  tooltip?: string;
}

export default function UsageSettingsPage() {
  const subscription = useBillingStore((s) => s.subscription);
  const planName = subscription?.display_name ?? 'Free';

  // "Last updated" refresh state
  const [lastUpdated, setLastUpdated] = useState<'just now' | string>('just now');
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Simulate a brief refresh; real implementation would re-fetch /api/usage
    setTimeout(() => {
      setLastUpdated('just now');
      setRefreshing(false);
    }, 600);
  }, []);

  const resetLabel = mounted ? getNextResetLabel() : 'Wed';

  // Mock weekly usage limits. When a real usage API is available, replace these
  // values with data from /api/usage or the billing usage store.
  const weeklyLimits: UsageLimitBar[] = [
    {
      label: 'All models',
      percentUsed: 2,
      resetsLabel: `Resets ${resetLabel} 6:00 PM`,
    },
    {
      label: 'Sonnet only',
      percentUsed: 0,
      resetsLabel: `Resets ${resetLabel} 6:00 PM`,
      tooltip: 'Usage against models in the Sonnet tier',
    },
    {
      label: 'AGI Design',
      percentUsed: 7,
      resetsLabel: `Resets ${resetLabel} 6:00 PM`,
      tooltip: 'Usage against design-focused model routing',
    },
  ];

  // Daily routine runs: 0 of 15 used
  const dailyRunsUsed = 0;
  const dailyRunsLimit = 15;
  const dailyRunsPercent = Math.round((dailyRunsUsed / dailyRunsLimit) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Page header */}
      <div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Usage
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Plan usage limits and included resources.
        </p>
      </div>

      {/* Plan usage limits header */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            Plan usage limits
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--text-3)',
              background: 'var(--bg-hover, rgba(255,255,255,0.05))',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '2px 8px',
            }}
          >
            {planName}
          </span>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Current session */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
                Current session
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>0% used</span>
            </div>
            <Progress
              value={0}
              aria-label="Current session usage"
              className="h-2"
              indicatorClassName="bg-amber-500"
              style={{ background: 'var(--bg-hover, rgba(255,255,255,0.08))' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Starts when a message is sent
            </span>
          </div>

          {/* Weekly limits */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                Weekly limits
              </span>
              <a
                href="https://agi.app/docs/usage-limits"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--teal, #21808d)', textDecoration: 'none' }}
              >
                Learn more
              </a>
            </div>

            {weeklyLimits.map((bar) => (
              <div key={bar.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span
                    style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}
                    title={bar.tooltip}
                  >
                    {bar.label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {bar.percentUsed}% used
                  </span>
                </div>
                <Progress
                  value={bar.percentUsed}
                  aria-label={`${bar.label} weekly usage`}
                  className="h-2"
                  indicatorClassName="bg-amber-500"
                  style={{ background: 'var(--bg-hover, rgba(255,255,255,0.08))' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{bar.resetsLabel}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Last updated footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Last updated: {lastUpdated}</span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh usage data"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-3)',
              fontSize: 12,
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            <RefreshCw
              size={12}
              style={{
                animation: refreshing ? 'spin 0.6s linear infinite' : 'none',
              }}
            />
            Refresh
          </button>
        </div>
      </section>

      {/* Additional features: daily included routine runs */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Additional features
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
                Daily included routine runs
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {dailyRunsUsed} / {dailyRunsLimit}
              </span>
            </div>
            <Progress
              value={dailyRunsPercent}
              aria-label="Daily routine runs used"
              className="h-2"
              indicatorClassName="bg-amber-500"
              style={{ background: 'var(--bg-hover, rgba(255,255,255,0.08))' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              You have not run any routines yet
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
