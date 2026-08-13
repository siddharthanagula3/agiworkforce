/**
 * PaywallBottomSheet
 *
 * Opens as a @gorhom/bottom-sheet modal when an ApiPaywallError is caught in
 * the chat send path. Renders the gated feature, server reason, and the action
 * that can actually resolve it: subscribe, update billing, upgrade, or contact
 * sales. An inactive subscriber must never be mislabeled as a lower-tier user.
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
 *     recoveryAction={paywallProps?.recoveryAction}
 *     onDismiss={() => paywallRef.current?.close()}
 *   />
 */

import { useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Pressable } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { ArrowUpCircle, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/src/ui/theme';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { BILLING_PLAN_PRICING, isBillingPlanTier } from '@agiworkforce/types';
import type { PaywallRecoveryAction } from '@/src/features/chat/utils/paywallRecovery';

// ---------------------------------------------------------------------------
// Static lookup tables — module-level so they are never recreated on render.
// ---------------------------------------------------------------------------

const FEATURE_LABELS: Record<string, string> = {
  general_upgrade: 'More features',
  video_generation: 'Video generation',
  opus_5: 'Opus 5 access',
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

/**
 * Plan name for a `requiredTier` straight off the wire, or the vague fallback
 * when the key is not a plan we sell.
 *
 * Read from the shared billing catalog rather than a local table: the tiers this
 * sheet names are the same ones `BILLING_PLAN_CAPABILITY_TIERS` gates on, so a
 * local copy that lagged the catalog turned real refusals into "Upgrade to a
 * higher" — which is what `video_generation` (gated to Max 15x) rendered while
 * `max_15x` was missing here.
 */
function tierLabelFor(requiredTier: string): string {
  return isBillingPlanTier(requiredTier)
    ? BILLING_PLAN_PRICING[requiredTier].label
    : UNKNOWN_TIER_LABEL;
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
  /** Recovery that can actually resolve the server refusal. */
  recoveryAction?: PaywallRecoveryAction;
  /**
   * Optional caller-owned recovery. Billing settings uses this for its real
   * portal action instead of navigating back to itself.
   */
  onPrimaryAction?: () => void | Promise<void>;
  /**
   * Honest replacement for the CTA when this surface has no allowed recovery
   * action (for example, native plan changes before store products exist).
   */
  primaryActionUnavailableMessage?: string;
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
  function PaywallBottomSheetInner(
    {
      feature,
      requiredTier,
      reason,
      recoveryAction = 'upgrade',
      onPrimaryAction,
      primaryActionUnavailableMessage,
      onDismiss,
    },
    forwardedRef,
  ) {
    const colors = useThemeColors();
    const router = useRouter();
    const sheetRef = useRef<BottomSheet>(null);

    // Expose expand() / close() / snapToIndex() to the parent via forwardRef.
    useImperativeHandle(forwardedRef, () => sheetRef.current as BottomSheet);

    const featureLabel = FEATURE_LABELS[feature] ?? UNKNOWN_FEATURE_LABEL;
    const tierLabel = tierLabelFor(requiredTier);

    // Sales handoff is intentionally exact, not normalize-and-guess: an
    // unrecognised future tier must fail closed rather than becoming an
    // external-navigation CTA. The destination is a fixed HTTPS AGI origin and
    // still passes through the strict safeOpenURL allowlist.
    const salesTier =
      recoveryAction === 'upgrade' && (requiredTier === 'team' || requiredTier === 'enterprise')
        ? requiredTier
        : null;
    const title =
      recoveryAction === 'manage_billing'
        ? 'Update billing'
        : recoveryAction === 'subscribe'
          ? 'Choose a plan'
          : `Upgrade to ${tierLabel}`;
    const body =
      recoveryAction === 'manage_billing'
        ? `${featureLabel} is unavailable until your subscription is active.`
        : recoveryAction === 'subscribe'
          ? `${featureLabel} requires an active subscription.`
          : `${featureLabel} requires the ${tierLabel} plan.`;
    const primaryActionLabel =
      recoveryAction === 'manage_billing'
        ? 'Manage billing'
        : recoveryAction === 'subscribe'
          ? 'View plans'
          : salesTier
            ? 'Contact Sales'
            : 'View upgrade options';
    const hasPrimaryAction =
      onPrimaryAction !== undefined || salesTier !== null || !primaryActionUnavailableMessage;

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

    const handlePrimaryAction = useCallback(() => {
      sheetRef.current?.close();
      if (onPrimaryAction) {
        void onPrimaryAction();
        return;
      }
      if (salesTier) {
        void openExternalUrl(
          `https://agiworkforce.com/contact-sales?plan=${encodeURIComponent(salesTier)}`,
        );
        return;
      }
      router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0]);
    }, [onPrimaryAction, router, salesTier]);

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
        // Expose the upgrade/recovery controls instead of announcing the
        // entire sheet as one opaque adjustable element.
        accessible={false}
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
                {title}
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
            {body}
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

          {/* CTA follows the server-derived recovery action. */}
          {hasPrimaryAction ? (
            <Button
              title={primaryActionLabel}
              variant="primary"
              size="md"
              onPress={handlePrimaryAction}
              accessibilityLabel={salesTier ? `Contact Sales for ${tierLabel}` : primaryActionLabel}
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
              {primaryActionUnavailableMessage}
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
