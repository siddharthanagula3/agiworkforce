import { useState, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useTierStore } from '@/src/features/billing/store';
import { InviteCodeModal } from '@/src/features/cloud-bridge';
import { BILLING_PLAN_PRICING, formatPrivacyModeLabel } from '@agiworkforce/types';
import type { BillingPlanTier, BillingInterval } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';

// ---------------------------------------------------------------------------
// Tier display config (feature bullets read at render time, not hardcoded prices)
// ---------------------------------------------------------------------------

interface TierDisplayConfig {
  tier: BillingPlanTier;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}

const TIER_CONFIGS: TierDisplayConfig[] = [
  {
    tier: 'free',
    tagline: 'Private, on-device only',
    features: [
      'Local models only (≤5B parameters)',
      'All data stays on your device',
      'No account required',
      'No sync — local storage only',
    ],
    cta: 'Current plan',
  },
  {
    tier: 'pro',
    tagline: 'Cloud models + sync',
    features: [
      'GPT-5.5, Sonnet, Flash + auto-routing',
      '20M tokens/month included',
      'Sync chats, projects & memory',
      'Voice transcription (300 min/mo)',
    ],
    cta: 'Upgrade to Pro',
    highlight: true,
  },
  {
    tier: 'max',
    tagline: 'Flagship models, highest priority',
    features: [
      'Opus 4.8 + Grok 4.3 in auto-routing',
      '100M tokens/month included',
      'Sync chats, projects & memory',
      'Unlimited voice transcription',
    ],
    cta: 'Upgrade to Max',
  },
];

// ---------------------------------------------------------------------------
// TierCard
// ---------------------------------------------------------------------------

function TierCard({
  config,
  interval,
  isCurrentTier,
  onUpgrade,
}: {
  config: TierDisplayConfig;
  interval: BillingInterval;
  isCurrentTier: boolean;
  onUpgrade: (tier: BillingPlanTier) => void;
}) {
  const c = useThemeColors();
  const pricing = BILLING_PLAN_PRICING[config.tier];
  const priceUsd = interval === 'yearly' ? pricing.yearlyPriceUsd / 12 : pricing.monthlyPriceUsd;
  const isFree = pricing.monthlyPriceUsd === 0;

  const borderColor = config.highlight ? c.teal : c.border;
  const bgColor = config.highlight ? c.accentSurface : c.surfaceElevated;

  return (
    <View
      style={{
        borderWidth: config.highlight ? 1.5 : 1,
        borderColor,
        borderRadius: 16,
        backgroundColor: bgColor,
        padding: 16,
        marginBottom: 12,
        minWidth: 220,
      }}
    >
      {config.highlight && (
        <View
          style={{
            position: 'absolute',
            top: -1,
            right: 16,
            backgroundColor: c.teal,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 3,
          }}
        >
          <Text
            style={{ fontSize: 10, fontWeight: '700', color: c.accentText, letterSpacing: 0.5 }}
          >
            POPULAR
          </Text>
        </View>
      )}

      {/* Tier name + price */}
      <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 2 }}>
        {pricing.label}
      </Text>
      <Text style={{ fontSize: 12, color: c.textSecondary, marginBottom: 10 }}>
        {config.tagline}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 14 }}>
        {isFree ? (
          <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary }}>Free</Text>
        ) : (
          <>
            <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary }}>
              ${priceUsd % 1 === 0 ? priceUsd.toFixed(0) : priceUsd.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 13, color: c.textSecondary, paddingBottom: 3 }}>/mo</Text>
            {interval === 'yearly' && (
              <Text
                style={{
                  fontSize: 11,
                  color: c.teal,
                  paddingBottom: 3,
                  marginLeft: 4,
                  fontWeight: '600',
                }}
              >
                billed annually
              </Text>
            )}
          </>
        )}
      </View>

      {/* Feature list */}
      <View style={{ gap: 7, marginBottom: 16 }}>
        {config.features.map((feat) => (
          <View key={feat} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Check
              size={13}
              color={config.highlight ? c.teal : c.textSecondary}
              strokeWidth={2.5}
              style={{ marginTop: 2 }}
            />
            <Text style={{ fontSize: 13, color: c.textSecondary, flex: 1, lineHeight: 18 }}>
              {feat}
            </Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <Pressable
        onPress={() => !isCurrentTier && onUpgrade(config.tier)}
        disabled={isCurrentTier}
        style={({ pressed }) => ({
          backgroundColor: isCurrentTier
            ? c.neutralSurface
            : config.highlight
              ? c.teal
              : c.accentSurface,
          borderRadius: 10,
          paddingVertical: 11,
          alignItems: 'center',
          opacity: pressed && !isCurrentTier ? 0.8 : 1,
        })}
        accessibilityLabel={isCurrentTier ? 'Current plan' : config.cta}
        accessibilityRole="button"
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: isCurrentTier ? c.textMuted : config.highlight ? c.accentText : c.teal,
          }}
        >
          {isCurrentTier ? 'Current plan' : config.cta}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PricingScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const currentTier = useTierStore((s) => s.tier);
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
    }
  }, [router]);

  const handleUpgrade = useCallback((_tier: BillingPlanTier) => {
    setInviteModalOpen(true);
  }, []);

  if (!FEATURES.billing) return <FeatureUnavailable feature="Billing" />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          height: 52,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
            backgroundColor: pressed ? c.surfaceHover : c.transparent,
          })}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Zap size={16} color={c.teal} style={{ marginRight: 6 }} />
        <Text style={{ fontSize: 17, fontWeight: '600', color: c.textPrimary }}>Plans</Text>
      </View>

      {/* Interval toggle */}
      <View
        style={{
          flexDirection: 'row',
          margin: 16,
          backgroundColor: c.neutralSurface,
          borderRadius: 10,
          padding: 3,
        }}
      >
        {(['monthly', 'yearly'] as BillingInterval[]).map((iv) => (
          <Pressable
            key={iv}
            onPress={() => setInterval(iv)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: 'center',
              backgroundColor: interval === iv ? c.teal : c.transparent,
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: interval === iv }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: interval === iv ? c.accentText : c.textSecondary,
              }}
            >
              {iv === 'monthly' ? 'Monthly' : 'Yearly'}
              {iv === 'yearly' && (
                <Text style={{ fontSize: 11, color: interval === iv ? c.accentText : c.teal }}>
                  {' '}
                  save ~17%
                </Text>
              )}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tier cards — horizontal scroll on small screens */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {TIER_CONFIGS.map((cfg) => (
          <TierCard
            key={cfg.tier}
            config={cfg}
            interval={interval}
            isCurrentTier={currentTier === cfg.tier}
            onUpgrade={handleUpgrade}
          />
        ))}
      </ScrollView>

      {/* v1: paid upgrades route to InviteCodeModal (no IAP/Stripe in v1) */}
      <InviteCodeModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        source="team-plan"
        defaultTab="invite"
      />
    </SafeAreaView>
  );
}
