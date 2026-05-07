/**
 * PaywallBottomSheet
 *
 * Opens as a @gorhom/bottom-sheet modal when an ApiPaywallError is caught in
 * the chat send path. Renders the gated feature name, required tier, optional
 * reason string, and two CTAs:
 *   - "Upgrade to <Tier>" — opens the browser to /pricing?from=mobile-paywall
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
 *     requiredTier={paywallProps?.requiredTier ?? 'hobby'}
 *     reason={paywallProps?.reason}
 *     onDismiss={() => paywallRef.current?.close()}
 *   />
 */

import { useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Pressable } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { ArrowUpCircle, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { colors } from '@/lib/theme';
import { openExternalUrl } from '@/lib/safeOpenURL';

// ---------------------------------------------------------------------------
// Static lookup tables — module-level so they are never recreated on render.
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<string, string> = {
  hobby: 'Hobby',
  pro: 'Pro',
  pro_plus: 'Pro+',
  max: 'Max',
  enterprise: 'Enterprise',
};

const FEATURE_LABELS: Record<string, string> = {
  video_generation: 'Video generation',
  opus_4_7: 'Opus 4.7 access',
  gpt_5_5: 'GPT-5.5 access',
  computer_use: 'Computer use',
  deep_research: 'Deep research',
  image_quota: 'More image generation',
  token_cap: 'Higher token limits',
  mcp: 'MCP server support',
  web_search: 'Web search',
};

/** Fallback label when the feature key is unrecognised. */
const UNKNOWN_FEATURE_LABEL = 'This feature';

/** Fallback label when the tier key is unrecognised. */
const UNKNOWN_TIER_LABEL = 'a higher';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PaywallSheetProps {
  /** Feature key from ApiPaywallError.feature (e.g. 'token_cap'). */
  feature: string;
  /** Required tier key from ApiPaywallError.requiredTier (e.g. 'hobby'). */
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
    const sheetRef = useRef<BottomSheet>(null);

    // Expose expand() / close() / snapToIndex() to the parent via forwardRef.
    useImperativeHandle(forwardedRef, () => sheetRef.current as BottomSheet);
    // 'auto' snap point lets the sheet size itself to content.
    const snapPoints = useMemo(() => ['auto'], []);

    const featureLabel = FEATURE_LABELS[feature] ?? UNKNOWN_FEATURE_LABEL;
    const tierLabel = TIER_LABELS[requiredTier] ?? UNKNOWN_TIER_LABEL;

    // Build the pricing URL with UTM context for attribution.
    const pricingUrl = `https://agiworkforce.com/pricing?from=mobile-paywall&tier=${encodeURIComponent(requiredTier)}&feature=${encodeURIComponent(feature)}`;

    const handleSheetChange = useCallback(
      (index: number) => {
        if (index === -1) {
          onDismiss();
        }
      },
      [onDismiss],
    );

    const handleUpgrade = useCallback(async () => {
      sheetRef.current?.close();
      // openExternalUrl enforces the allowlist: agiworkforce.com / stripe.com only.
      const opened = await openExternalUrl(pricingUrl);
      if (!opened && __DEV__) {
        console.warn('[PaywallBottomSheet] openExternalUrl refused:', pricingUrl);
      }
    }, [pricingUrl]);

    const handleDismiss = useCallback(() => {
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
        snapPoints={snapPoints}
        onChange={handleSheetChange}
        enablePanDownToClose
        enableDynamicSizing
        backgroundStyle={{
          backgroundColor: colors.surfaceElevated,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
        handleIndicatorStyle={{
          backgroundColor: 'rgba(255, 255, 255, 0.3)',
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
                  backgroundColor: 'rgba(251, 191, 36, 0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowUpCircle size={20} color="#FBbf24" />
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
                color: 'rgba(255,255,255,0.5)',
                lineHeight: 20,
                marginBottom: 20,
              }}
            >
              {reason}
            </Text>
          ) : null}

          {/* CTAs */}
          <Button
            title={`Upgrade to ${tierLabel}`}
            variant="primary"
            size="md"
            onPress={handleUpgrade}
            accessibilityLabel={`Upgrade to ${tierLabel} plan`}
          />
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
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Try later</Text>
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
