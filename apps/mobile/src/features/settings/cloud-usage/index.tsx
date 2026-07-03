/**
 * Cloud Usage Settings Screen
 *
 * Native RN equivalent of the web UsageSection. Fetches GET /api/usage (via
 * services/usage.ts) and shows plan usage as a percentage — the primary
 * metric is "X% used" + a progress bar + reset date, matching the reference
 * pattern (Claude iOS Settings → Usage: a bar, "2% used", "Resets in 4hr
 * 58min" — no raw dollar figures on the primary surface). Exact dollar
 * figures are available in a collapsed "Details" section for users who want
 * them, never as the headline number.
 *
 * Gated behind FEATURES.billing — when that flag is false the screen shows a
 * placeholder directing users to the web dashboard, since v1 does not yet
 * have the billing ledger active.
 *
 * Cloud-only surface.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Pressable } from 'react-native';
import { BarChart3, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { fetchUsageSnapshot, type UsageSnapshot } from '@/services/usage';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { FEATURES } from '@/lib/v1FeatureFlags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  max: 'Max',
  team: 'Team',
  enterprise: 'Enterprise',
};

function formatResetDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

// ---------------------------------------------------------------------------
// UsagePercentBar — the primary, percentage-only metric (Claude-style)
// ---------------------------------------------------------------------------

function UsagePercentBar({
  label,
  percentage,
  resetLabel,
}: {
  label: string;
  percentage: number;
  resetLabel: string | null;
}) {
  const colors = useThemeColors();
  const clamped = Math.min(100, Math.max(0, percentage));
  const isNearLimit = clamped >= 90;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{label}</Text>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.progressTrack,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: isNearLimit ? colors.agentError : colors.teal,
            width: `${clamped}%`,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {Math.round(clamped)}% used
        </Text>
        {resetLabel && (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Resets {resetLabel}</Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StatRow — simple two-column label / value (used only inside "Details")
// ---------------------------------------------------------------------------

function StatRow({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 36,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Placeholder — billing not yet active
// ---------------------------------------------------------------------------

function BillingUnavailablePlaceholder() {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: 14,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 20,
        alignItems: 'center',
        gap: 12,
        marginBottom: 18,
      }}
    >
      <BarChart3 size={32} color={colors.textMuted} />
      <Text
        style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', textAlign: 'center' }}
      >
        Usage dashboard coming soon
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
        Detailed usage ledger and credit tracking will be available once AGI Cloud billing is
        active.
      </Text>
      <Pressable
        onPress={() => void openExternalUrl('https://agiworkforce.com/settings/usage')}
        accessibilityRole="button"
        accessibilityLabel="View usage on web"
        style={({ pressed }) => ({
          marginTop: 4,
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceHover : colors.surfaceBase,
        })}
      >
        <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>View on web</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CloudUsageScreen() {
  const colors = useThemeColors();

  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsageSnapshot();
      setSnapshot(data);
      setLastUpdated(
        new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load usage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (FEATURES.billing) void load();
  }, [load]);

  const planLabel = snapshot ? (PLAN_LABELS[snapshot.planTier] ?? snapshot.planTier) : '';
  const periodResetLabel = snapshot ? formatResetDate(snapshot.periodEnd) : null;

  return (
    <SettingsScreenShell title="Usage">
      <SettingsInfo
        title="Plan usage"
        body="See how much of your plan's included usage you've used this period."
        icon={BarChart3}
      />

      {/* Billing not yet active */}
      {!FEATURES.billing && <BillingUnavailablePlaceholder />}

      {/* Live usage */}
      {FEATURES.billing && (
        <>
          {loading && !snapshot && (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator size="large" color={colors.teal} />
            </View>
          )}

          {error && (
            <View
              style={{
                borderRadius: 12,
                backgroundColor: colors.dangerSurface,
                borderWidth: 1,
                borderColor: colors.dangerBorder,
                padding: 12,
                marginBottom: 18,
              }}
            >
              <Text style={{ color: colors.agentError, fontSize: 13 }}>{error}</Text>
            </View>
          )}

          {snapshot && (
            <>
              {/* Primary card — percentage only, Claude-style */}
              <View
                style={{
                  borderRadius: 14,
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                  marginBottom: 18,
                }}
              >
                <View
                  style={{
                    padding: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {planLabel} plan
                  </Text>
                  {lastUpdated && (
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      Updated {lastUpdated}
                    </Text>
                  )}
                </View>

                <View style={{ padding: 16, gap: 20 }}>
                  {snapshot.hasDailyLimit ? (
                    <UsagePercentBar
                      label="Today"
                      percentage={
                        snapshot.dailyLimitCents > 0
                          ? (snapshot.dailyUsedCents / snapshot.dailyLimitCents) * 100
                          : 0
                      }
                      resetLabel="tomorrow"
                    />
                  ) : (
                    <UsagePercentBar
                      label="This period"
                      percentage={snapshot.usagePercentage}
                      resetLabel={periodResetLabel}
                    />
                  )}
                </View>

                {/* Footer — refresh */}
                <View
                  style={{
                    padding: 12,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                  }}
                >
                  <Pressable
                    onPress={() => void load()}
                    disabled={loading}
                    accessibilityLabel="Refresh usage"
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                      opacity: loading ? 0.5 : 1,
                    })}
                  >
                    <RefreshCw size={12} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Refresh</Text>
                  </Pressable>
                </View>
              </View>

              {/* Details — raw dollar figures, collapsed by default (Claude/web pattern:
                  percentage is the headline, exact numbers are opt-in, never primary). */}
              <Pressable
                onPress={() => setDetailsOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={detailsOpen ? 'Hide usage details' : 'Show usage details'}
                accessibilityState={{ expanded: detailsOpen }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  marginBottom: detailsOpen ? 8 : 18,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500' }}>
                  Details
                </Text>
                {detailsOpen ? (
                  <ChevronUp size={16} color={colors.textMuted} />
                ) : (
                  <ChevronDown size={16} color={colors.textMuted} />
                )}
              </Pressable>

              {detailsOpen && (
                <View
                  style={{
                    borderRadius: 14,
                    backgroundColor: colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 16,
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  <StatRow
                    label="Included this period"
                    value={money(snapshot.creditsAllocatedCents)}
                  />
                  <StatRow label="Used" value={money(snapshot.creditsUsedCents)} />
                  <StatRow label="Remaining" value={money(snapshot.creditsRemainingCents)} />
                  {snapshot.hasDailyLimit && (
                    <>
                      <StatRow label="Daily budget" value={money(snapshot.dailyLimitCents)} />
                      <StatRow label="Used today" value={money(snapshot.dailyUsedCents)} />
                    </>
                  )}
                </View>
              )}
            </>
          )}
        </>
      )}
    </SettingsScreenShell>
  );
}
