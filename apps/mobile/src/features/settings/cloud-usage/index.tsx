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
 * Gated behind FEATURES.usageDashboard — when that flag is false the screen
 * shows a placeholder directing users to the web dashboard. Deliberately
 * separate from FEATURES.billing, which gates the external Stripe portal
 * link on the Billing screen (App Store Guideline 3.1.1 risk); this screen
 * only reads a balance, so it doesn't carry that risk.
 *
 * Cloud-only surface.
 */

import { useCallback, useEffect, useState } from 'react';
import { managedUsageBucketLabel } from '@agiworkforce/types';
import { View, ActivityIndicator } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import { BarChart3, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsInfo,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { fetchUsageSnapshot, type UsageSnapshot } from '@/services/usage';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** "Wed 6:00 PM" style — used for the weekly rolling-window reset (an
 *  absolute moment: oldest-transaction-in-window + 7 days), matching the
 *  Claude-reference "Resets Wed 6:00 PM" pattern. */
function formatResetWeekday(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/** "3 hr 27 min" style countdown for the rolling 5h session window. */
function formatResetsInDuration(iso: string | null): string | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return null;
  const msRemaining = target - Date.now();
  if (msRemaining <= 0) return null;
  const totalMinutes = Math.round(msRemaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours} hr ${minutes} min`;
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
  const router = useRouter();
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const isCloudModeActive = appMode === 'cloud';

  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const load = useCallback(async () => {
    const account = captureCloudAccountEpoch();
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsageSnapshot();
      if (!isCloudAccountEpochCurrent(account)) return;
      setSnapshot(data);
      setLastUpdated(
        new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      );
    } catch (err) {
      if (!isCloudAccountEpochCurrent(account)) return;
      setError(err instanceof Error ? err.message : 'Could not load usage');
    } finally {
      if (isCloudAccountEpochCurrent(account)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSnapshot(null);
    setLoading(false);
    setError(null);
    setLastUpdated(null);
  }, [clerkUserId]);

  // guardedFetch blocks this screen's own fetch (an EgressBlockedError) while
  // chat is set to Local — see CloudSyncBlockedBanner's doc comment. Skip the
  // doomed request and show the banner instead of the raw technical error
  // message; re-fetch as soon as the user switches modes.
  useEffect(() => {
    if (FEATURES.usageDashboard && isClerkSignedIn && isCloudModeActive) void load();
  }, [clerkUserId, load, isClerkSignedIn, isCloudModeActive]);

  const handleSignIn = useCallback(() => {
    router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
  }, [router]);

  const planLabel = snapshot ? getBillingPlanPricing(snapshot.planTier).label : '';
  const periodResetLabel = snapshot ? formatResetDate(snapshot.usageResetAt) : null;

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell title="Usage">
        <CloudAccountRequired isLoading={!isClerkLoaded} onSignIn={handleSignIn} />
      </SettingsScreenShell>
    );
  }

  return (
    <SettingsScreenShell title="Usage">
      <SettingsInfo
        title="Plan usage"
        body="See how much of your plan's included usage you've used this period."
        icon={BarChart3}
      />

      {/* Usage backend not yet active */}
      {!FEATURES.usageDashboard && <BillingUnavailablePlaceholder />}

      {FEATURES.usageDashboard && !isCloudModeActive && (
        <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
      )}

      {/* Live usage */}
      {FEATURES.usageDashboard && isCloudModeActive && (
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
              <Pressable
                onPress={() => void load()}
                disabled={loading}
                accessibilityLabel="Retry loading usage"
                accessibilityRole="button"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 10,
                  minHeight: 32,
                }}
              >
                <RefreshCw size={14} color={colors.agentError} />
                <Text style={{ color: colors.agentError, fontSize: 13, fontWeight: '600' }}>
                  {loading ? 'Retrying…' : 'Retry'}
                </Text>
              </Pressable>
            </View>
          )}

          {snapshot && (
            <>
              {/* Current session — rolling 5h window, layers on top of the
                  monthly budget (founder decision, 2026-07-05). Percentage-only
                  contract: a null reset means the window is inactive for this
                  tier (e.g. free) or unused, so hide the section entirely. */}
              {snapshot.sessionResetAt !== null && (
                <View
                  style={{
                    borderRadius: 14,
                    backgroundColor: colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 16,
                    marginBottom: 18,
                  }}
                >
                  <UsagePercentBar
                    label={managedUsageBucketLabel('session')}
                    percentage={snapshot.sessionUsagePercentage}
                    resetLabel={
                      formatResetsInDuration(snapshot.sessionResetAt) === null
                        ? null
                        : `in ${formatResetsInDuration(snapshot.sessionResetAt)}`
                    }
                  />
                </View>
              )}

              {/* Weekly limits — "All models" + flagship-only sub-bucket,
                  both rolling 7-day windows. Same layering rationale as session. */}
              {snapshot.weeklyResetAt !== null && (
                <>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 13,
                      fontWeight: '600',
                      marginBottom: 8,
                    }}
                  >
                    Weekly limits
                  </Text>
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
                    <View style={{ padding: 16 }}>
                      <UsagePercentBar
                        label={managedUsageBucketLabel('weekly')}
                        percentage={snapshot.weeklyUsagePercentage}
                        resetLabel={formatResetWeekday(snapshot.weeklyResetAt)}
                      />
                    </View>
                    {snapshot.flagshipWeeklyResetAt !== null && (
                      <View
                        style={{
                          padding: 16,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        <UsagePercentBar
                          label={managedUsageBucketLabel('weeklyFlagship')}
                          percentage={snapshot.flagshipWeeklyUsagePercentage}
                          resetLabel={formatResetWeekday(snapshot.flagshipWeeklyResetAt)}
                        />
                      </View>
                    )}
                  </View>
                </>
              )}

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
                  <UsagePercentBar
                    label={managedUsageBucketLabel('period')}
                    percentage={snapshot.usagePercentage}
                    resetLabel={periodResetLabel}
                  />
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
                  {/*
                    No `style` prop on Pressable — its function-style
                    `style={({pressed}) => ({...})}` callback silently drops
                    layout properties (flexDirection/alignItems/padding) in
                    this stack (nativewind 4.2.3 + react-native-css-interop
                    0.2.3), which stacked the icon above "Refresh" instead of
                    beside it. Same class as MOBILE-PRESSABLE-CSSINTEROP-FLEXDIR-01
                    (docs/agent-context/known-flaws.md) — using `children` as a
                    function instead routes pressed state through a plain
                    object-literal-style View, which renders correctly.
                  */}
                  <Pressable
                    onPress={() => void load()}
                    disabled={loading}
                    accessibilityLabel="Refresh usage"
                    accessibilityRole="button"
                  >
                    {({ pressed }) => (
                      <View
                        style={{
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
                        }}
                      >
                        <RefreshCw size={12} color={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Refresh</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </>
      )}
    </SettingsScreenShell>
  );
}
