import { useCallback, useEffect } from 'react';
import {
  formatCreditWindowUsage,
  formatPlanCreditAllowanceLine,
  managedUsageBucketLabel,
  type ManagedUsageCreditWindow,
} from '@agiworkforce/types';
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
import { useCloudUsageStore } from './store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';

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

function formatResetWeekday(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

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

function UsagePercentBar({
  label,
  percentage,
  resetLabel,
  credits,
}: {
  label: string;
  percentage: number;
  resetLabel: string | null;
  credits?: ManagedUsageCreditWindow | null;
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
          {credits
            ? formatCreditWindowUsage(credits.used, credits.allowance)
            : `${Math.round(clamped)}% used`}
        </Text>
        {resetLabel && (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Resets {resetLabel}</Text>
        )}
      </View>
    </View>
  );
}

export default function CloudUsageScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const isCloudModeActive = appMode === 'cloud';

  const ownerId = useCloudUsageStore((s) => s.ownerId);
  const cachedSnapshot = useCloudUsageStore((s) => s.snapshot);
  const loading = useCloudUsageStore((s) => s.loading);
  const error = useCloudUsageStore((s) => s.error);
  const updatedAt = useCloudUsageStore((s) => s.updatedAt);
  const load = useCloudUsageStore((s) => s.refresh);
  const snapshot = ownerId === clerkUserId ? cachedSnapshot : null;
  const lastUpdated =
    ownerId === clerkUserId && updatedAt !== null
      ? new Date(updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null;

  useEffect(() => {
    if (isClerkSignedIn && isCloudModeActive) void load();
  }, [clerkUserId, load, isClerkSignedIn, isCloudModeActive]);

  const handleSignIn = useCallback(() => {
    router.push(beginCloudPostAuthIntent('cloud-usage'));
  }, [router]);

  const planLabel = snapshot ? getBillingPlanPricing(snapshot.planTier).label : '';
  const periodResetLabel = snapshot ? formatResetDate(snapshot.usageResetAt) : null;
  const planAllowanceLine = snapshot?.credits
    ? formatPlanCreditAllowanceLine(planLabel, {
        monthly: snapshot.credits.monthly.allowance,
        weekly: snapshot.credits.weekly.allowance,
        fiveHour: snapshot.credits.five_hour.allowance,
      })
    : null;

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

      {!isCloudModeActive && <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />}

      {/* Live usage */}
      {isCloudModeActive && (
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
              {/* Current session, rolling 5h window, layers on top of the
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
                    credits={snapshot.credits?.five_hour}
                  />
                </View>
              )}

              {/* Weekly limits, "All models" + flagship-only sub-bucket,
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
                        credits={snapshot.credits?.weekly}
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
                          credits={snapshot.credits?.flagship_weekly}
                        />
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Primary card, percentage only, Claude-style */}
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

                {planAllowanceLine && (
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      paddingHorizontal: 14,
                      paddingTop: 10,
                    }}
                  >
                    {planAllowanceLine}
                  </Text>
                )}

                <View style={{ padding: 16, gap: 20 }}>
                  <UsagePercentBar
                    label={managedUsageBucketLabel('period')}
                    percentage={snapshot.usagePercentage}
                    resetLabel={periodResetLabel}
                    credits={snapshot.credits?.monthly}
                  />
                </View>

                {/* Footer, refresh */}
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
                    No `style` prop on Pressable, its function-style
                    `style={({pressed}) => ({...})}` callback silently drops
                    layout properties (flexDirection/alignItems/padding) in
                    this stack (nativewind 4.2.3 + react-native-css-interop
                    0.2.3), which stacked the icon above "Refresh" instead of
                    beside it. Same class as MOBILE-PRESSABLE-CSSINTEROP-FLEXDIR-01
                    (docs/agent-context/known-flaws.md), using `children` as a
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
