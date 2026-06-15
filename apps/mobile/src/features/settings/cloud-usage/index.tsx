/**
 * Cloud Usage Settings Screen
 *
 * Native RN equivalent of the web UsageSection. Fetches /api/usage/summary
 * (via the existing services/usage.ts service) and renders credit bars,
 * session counts, and cost breakdowns. Gated behind FEATURES.billing —
 * when that flag is false the screen shows a placeholder directing users to
 * the web dashboard, since v1 does not yet have the billing ledger active.
 *
 * Cloud-only surface.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Pressable } from 'react-native';
import { BarChart3, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { fetchUsageSummary, type UsageSummary } from '@/services/usage';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { FEATURES } from '@/lib/v1FeatureFlags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(n: number): string {
  return `$${Math.max(0, n).toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// UsageBar — native progress bar row
// ---------------------------------------------------------------------------

function UsageBar({
  label,
  value,
  detail,
  percent,
}: {
  label: string;
  value: string;
  detail: string;
  percent: number;
}) {
  const colors = useThemeColors();
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500' }}>
          {label}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{value}</Text>
      </View>
      {/* Track */}
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.progressTrack,
          overflow: 'hidden',
        }}
      >
        {/* Fill */}
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.teal,
            width: `${clamped}%`,
          }}
        />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{detail}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StatRow — simple two-column label / value
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
        borderBottomWidth: 0,
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

  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsageSummary();
      setSummary(data);
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

  const totalTokens = summary?.totalTokens ?? 0;
  const totalCost = summary?.totalCost ?? 0;
  const conversations = summary?.conversationCount ?? 0;

  // Derive a rough percent from daily usage vs model breakdown max
  const maxModelCost =
    summary?.modelBreakdown.reduce((m, b) => Math.max(m, b.estimatedCost), 0) ?? 0;
  const totalPercent =
    maxModelCost > 0 ? Math.min(100, Math.round((totalCost / (maxModelCost * 10)) * 100)) : 0;

  return (
    <SettingsScreenShell title="Usage">
      <SettingsInfo
        title="Plan usage, credits, and recent activity"
        body="Usage data is sourced from your AGI Cloud account ledger and refreshes on demand."
        icon={BarChart3}
      />

      {/* Billing not yet active */}
      {!FEATURES.billing && <BillingUnavailablePlaceholder />}

      {/* Live usage */}
      {FEATURES.billing && (
        <>
          {loading && !summary && (
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

          {summary && (
            <>
              {/* Summary card */}
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
                    {summary.period}
                  </Text>
                  {lastUpdated && (
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      Updated {lastUpdated}
                    </Text>
                  )}
                </View>

                <View style={{ padding: 16, gap: 20 }}>
                  <UsageBar
                    label="Total spend"
                    value={money(totalCost)}
                    detail={`${formatTokens(totalTokens)} tokens across ${conversations} conversation${conversations !== 1 ? 's' : ''}`}
                    percent={totalPercent}
                  />

                  {summary.dailyUsage.length > 0 && (
                    <UsageBar
                      label="Today"
                      value={money(
                        summary.dailyUsage[summary.dailyUsage.length - 1]?.estimatedCost ?? 0,
                      )}
                      detail={`${formatTokens(summary.dailyUsage[summary.dailyUsage.length - 1]?.totalTokens ?? 0)} tokens`}
                      percent={
                        totalCost > 0
                          ? Math.min(
                              100,
                              Math.round(
                                ((summary.dailyUsage[summary.dailyUsage.length - 1]
                                  ?.estimatedCost ?? 0) /
                                  totalCost) *
                                  100,
                              ),
                            )
                          : 0
                      }
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

              {/* Model breakdown */}
              {summary.modelBreakdown.length > 0 && (
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
                    style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
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
                      By model
                    </Text>
                  </View>
                  <View style={{ padding: 16, gap: 10 }}>
                    {summary.modelBreakdown.map((m) => (
                      <StatRow key={m.modelId} label={m.modelName} value={money(m.estimatedCost)} />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </>
      )}
    </SettingsScreenShell>
  );
}
