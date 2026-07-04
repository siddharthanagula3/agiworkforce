/**
 * PaywallBottomSheet
 *
 * Opens as a @gorhom/bottom-sheet modal when an ApiPaywallError is caught in
 * the chat send path. Renders the gated feature name, required tier, optional
 * reason string, and two CTAs:
 *   - "Upgrade to <Tier>" — triggers the native StoreKit/Play Billing purchase
 *     sheet via `useIapPurchaseFlow` (never a web/browser checkout — Apple/Google
 *     require native IAP for in-app subscription purchases).
 *   - "Try later" — dismisses the sheet
 *
 * Design mirrors the web InlinePaywallCard but uses React Native primitives.
 *
 * Usage:
 *   const paywallRef = useRef<BottomSheet>(null);
 *   const [paywallProps, setPaywallProps] = useState<PaywallSheetProps | null>(null);
 *
 *   // On ApiPaywallError:
 *   setPaywallProps({ feature, requiredTier, reason });
 *   paywallRef.current?.expand();
 *
 *   <PaywallBottomSheet
 *     ref={paywallRef}
 *     feature={paywallProps?.feature ?? 'token_cap'}
 *     requiredTier={paywallProps?.requiredTier ?? 'basic'}
 *     reason={paywallProps?.reason}
 *     onDismiss={() => paywallRef.current?.close()}
 *   />
 */

import { useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { ArrowUpCircle, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { normalizeBillingPlanTier } from '@agiworkforce/types';
import { isPurchasableTier, type PurchasableTier } from '@/src/features/billing/iapProducts';
import { useIapPurchaseFlow } from '@/src/features/billing/useIapPurchaseFlow';
import { useIapStore } from '@/src/features/billing/iapStore';

// ---------------------------------------------------------------------------
// Static lookup tables — module-level so they are never recreated on render.
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<string, string> = {
  'local-only': 'Local Mode',
  byok: 'Local Mode + BYOK',
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  max: 'Max',
  team: 'Team',
  enterprise: 'Enterprise',
};

const FEATURE_LABELS: Record<string, string> = {
  general_upgrade: 'More features',
  video_generation: 'Video generation',
  opus_4_7: 'Opus 4.7 access',
  gpt_5_5: 'GPT-5.5 access',
  computer_use: 'Computer use',
  deep_research: 'Deep research',
  image_quota: 'More image generation',
  image_generation: 'AI image generation',
  token_cap: 'Higher token limits',
  mcp: 'MCP server support',
  web_search: 'Web search',
  model_access: 'This model',
};

/** Fallback label when the feature key is unrecognised. */
const UNKNOWN_FEATURE_LABEL = 'This feature';

/** Fallback label when the tier key is unrecognised. */
const UNKNOWN_TIER_LABEL = 'a higher';

// ---------------------------------------------------------------------------
// Native IAP upgrade button — only mounted when `FEATURES.iap` is on and the
// resolved tier has a real StoreKit/Play product. `useIapPurchaseFlow` must
// not be called unconditionally: it lazily `require()`s `react-native-iap`,
// whose native module isn't linked while the flag is off, so calling the hook
// outside this gated child would crash the paywall on every render.
// ---------------------------------------------------------------------------

function IapUpgradeButton({
  tier,
  tierLabel,
  onPurchased,
}: {
  tier: PurchasableTier;
  tierLabel: string;
  onPurchased: () => void;
}) {
  const colors = useThemeColors();
  const { purchase } = useIapPurchaseFlow();
  const status = useIapStore((s) => s.status);
  const errorMessage = useIapStore((s) => s.errorMessage);
  const isBusy = status === 'purchasing' || status === 'verifying';

  useEffect(() => {
    if (status === 'success') onPurchased();
  }, [status, onPurchased]);

  const handlePress = useCallback(() => {
    void purchase(tier, 'monthly');
  }, [purchase, tier]);

  return (
    <View>
      <Button
        title={isBusy ? 'Processing…' : `Upgrade to ${tierLabel}`}
        variant="primary"
        size="md"
        onPress={isBusy ? undefined : handlePress}
        accessibilityLabel={`Upgrade to ${tierLabel} plan`}
      />
      {isBusy ? (
        <View style={{ marginTop: 8, alignItems: 'center' }}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : null}
      {status === 'error' && errorMessage ? (
        <Text
          style={{
            fontSize: 12,
            color: colors.agentError,
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PaywallSheetProps {
  /** Feature key from ApiPaywallError.feature (e.g. 'token_cap'). */
  feature: string;
  /** Required tier key from ApiPaywallError.requiredTier (e.g. 'basic'). */
  requiredTier: string;
  /** Optional human-readable reason from the server (e.g. '10/10 images used'). */
  reason?: string;
  /** Called when the user dismisses the sheet. */
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PaywallBottomSheet wraps @gorhom/bottom-sheet.
 * The caller controls open/close via a ref; props drive the copy.
 *
 * Pass `ref` to imperatively call `.expand()` / `.close()`.
 */
export const PaywallBottomSheet = forwardRef<BottomSheet, PaywallSheetProps>(
  function PaywallBottomSheetInner({ feature, requiredTier, reason, onDismiss }, forwardedRef) {
    const colors = useThemeColors();
    const sheetRef = useRef<BottomSheet>(null);

    // Expose expand() / close() / snapToIndex() to the parent via forwardRef.
    useImperativeHandle(forwardedRef, () => sheetRef.current as BottomSheet);

    const featureLabel = FEATURE_LABELS[feature] ?? UNKNOWN_FEATURE_LABEL;
    const tierLabel = TIER_LABELS[requiredTier] ?? UNKNOWN_TIER_LABEL;

    // Resolve the required tier to a purchasable IAP tier, if one exists.
    // `enterprise` (contact-sales, $0 self-serve price) and any unrecognised
    // tier string have no StoreKit/Play product — those fall through to the
    // informational (no-CTA) branch below rather than a dead button.
    const purchasableTier = normalizeBillingPlanTier(requiredTier);
    const canPurchaseInApp = FEATURES.iap && isPurchasableTier(purchasableTier);

    const handleSheetChange = useCallback(
      (index: number) => {
        if (index === -1) {
          onDismiss();
        }
      },
      [onDismiss],
    );

    const handleDismiss = useCallback(() => {
      sheetRef.current?.close();
    }, []);

    const handlePurchased = useCallback(() => {
      sheetRef.current?.close();
    }, []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
          pressBehavior="close"
        />
      ),
      [],
    );

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        onChange={handleSheetChange}
        enablePanDownToClose
        enableDynamicSizing
        backgroundStyle={{
          backgroundColor: colors.surfaceElevated,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
        handleIndicatorStyle={{
          backgroundColor: colors.neutralBorder,
          width: 36,
        }}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView
          style={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 36,
          }}
        >
          {/* Header row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            {/* Icon + title */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: colors.warningSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowUpCircle size={20} color={colors.agentWarning} />
              </View>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: '600',
                  color: colors.textPrimary,
                  flex: 1,
                  flexWrap: 'wrap',
                }}
              >
                Upgrade to {tierLabel}
              </Text>
            </View>

            {/* Close button — 44pt touch target per iOS HIG */}
            <Pressable
              onPress={handleDismiss}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              accessibilityLabel="Dismiss"
              accessibilityRole="button"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Body copy */}
          <Text
            style={{
              fontSize: 15,
              color: colors.textSecondary,
              lineHeight: 22,
              marginBottom: reason ? 8 : 20,
            }}
          >
            {featureLabel} requires the {tierLabel} plan.
          </Text>

          {/* Server-supplied reason (e.g. "10/10 images used this month") */}
          {reason ? (
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                lineHeight: 20,
                marginBottom: 20,
              }}
            >
              {reason}
            </Text>
          ) : null}

          {/* CTAs */}
          {canPurchaseInApp ? (
            <IapUpgradeButton
              tier={purchasableTier as PurchasableTier}
              tierLabel={tierLabel}
              onPurchased={handlePurchased}
            />
          ) : (
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                lineHeight: 20,
                marginBottom: 4,
              }}
            >
              Upgrades aren't available in the app yet. Check back soon.
            </Text>
          )}
          <Pressable
            onPress={handleDismiss}
            style={{
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 8,
            }}
            accessibilityLabel="Try later"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 14, color: colors.textMuted }}>Try later</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

PaywallBottomSheet.displayName = 'PaywallBottomSheet';

/**
 * Expose the internal ref type so callers can store a ref to the BottomSheet
 * and call `.expand()` / `.close()` imperatively.
 */
export type { BottomSheet as PaywallBottomSheetHandle };
