import { useState, useCallback } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';
import { useTierStore } from '@/stores/tierStore';
import { api } from '@/services/api';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import type { BillingPlanTier, BillingInterval } from '@agiworkforce/types';

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
    tagline: 'Get started for free',
    features: [
      'Access to basic models',
      'Local mode (your device)',
      'Bring Your Own Key (BYOK)',
      'Community support',
    ],
    cta: 'Current plan',
  },
  {
    tier: 'hobby',
    tagline: 'Managed cloud, everyday use',
    features: [
      'Managed cloud credits included',
      'Voice transcription (60 min/mo)',
      'Image generation (10/mo)',
      'Priority response',
    ],
    cta: 'Upgrade to Hobby',
    highlight: true,
  },
  {
    tier: 'pro',
    tagline: 'Power users & professionals',
    features: [
      'Everything in Hobby',
      'Voice transcription (300 min/mo)',
      'Computer use (light)',
      'Multi-provider switching',
    ],
    cta: 'Upgrade to Pro',
  },
  {
    tier: 'pro_plus',
    tagline: 'Teams & advanced workflows',
    features: [
      'Everything in Pro',
      'Voice transcription (1,500 min/mo)',
      'Computer use (advanced)',
      'Unlimited image generation',
      'Video generation (60s)',
    ],
    cta: 'Upgrade to Pro+',
  },
  {
    tier: 'max',
    tagline: 'Unlimited, uncapped power',
    features: [
      'Everything in Pro+',
      'Unlimited voice transcription',
      'Computer use (2,500 actions)',
      'Video generation (5 min via Runway + Veo)',
      'Highest-priority routing',
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
  const bgColor = config.highlight ? `${c.teal}0d` : c.surfaceElevated;

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
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 }}>
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
            ? 'rgba(255,255,255,0.06)'
            : config.highlight
              ? c.teal
              : `${c.teal}33`,
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
            color: isCurrentTier ? c.textMuted : config.highlight ? '#fff' : c.teal,
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
  const [upgrading, setUpgrading] = useState(false);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
    }
  }, [router]);

  const handleUpgrade = useCallback(
    async (tier: BillingPlanTier) => {
      if (upgrading) return;
      setUpgrading(true);
      try {
        const data = await api.post<{ url: string }>('/api/checkout', { tier, interval });
        if (data.url && (await openExternalUrl(data.url))) {
          return;
        }
      } catch {
        // Fall through to static URL
      } finally {
        setUpgrading(false);
      }
      Alert.alert(
        'Upgrade',
        'Could not open checkout. Please visit agiworkforce.com/billing in your browser.',
      );
    },
    [interval, upgrading],
  );

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
          className="w-9 h-9 rounded-lg items-center justify-center active:bg-white/5 mr-2"
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
          backgroundColor: 'rgba(255,255,255,0.06)',
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
              backgroundColor: interval === iv ? c.teal : 'transparent',
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: interval === iv }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: interval === iv ? '#fff' : c.textSecondary,
              }}
            >
              {iv === 'monthly' ? 'Monthly' : 'Yearly'}
              {iv === 'yearly' && (
                <Text style={{ fontSize: 11, color: interval === iv ? '#ffffffcc' : c.teal }}>
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
    </SafeAreaView>
  );
}
