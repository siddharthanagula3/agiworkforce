import { useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
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
import { typeScale } from '@/src/ui/theme/tokens';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { BILLING_PLAN_PRICING, isBillingPlanTier } from '@agiworkforce/types';
import type { PaywallRecoveryAction } from '@/src/features/chat/utils/paywallRecovery';

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

const UNKNOWN_FEATURE_LABEL = 'This feature';

const UNKNOWN_TIER_LABEL = 'a higher';

function tierLabelFor(requiredTier: string): string {
  return isBillingPlanTier(requiredTier)
    ? BILLING_PLAN_PRICING[requiredTier].label
    : UNKNOWN_TIER_LABEL;
}

export interface PaywallSheetProps {
  feature: string;
  requiredTier: string;
  reason?: string;
  recoveryAction?: PaywallRecoveryAction;
  onPrimaryAction?: () => void | Promise<void>;
  primaryActionUnavailableMessage?: string;
  resetLabel?: string | null;
  onChooseStandardModel?: () => void;
  onDismiss: () => void;
}

export const PaywallBottomSheet = forwardRef<BottomSheet, PaywallSheetProps>(
  function PaywallBottomSheetInner(
    {
      feature,
      requiredTier,
      reason,
      recoveryAction = 'upgrade',
      onPrimaryAction,
      primaryActionUnavailableMessage,
      resetLabel,
      onChooseStandardModel,
      onDismiss,
    },
    forwardedRef,
  ) {
    const colors = useThemeColors();
    const router = useRouter();
    const sheetRef = useRef<BottomSheet>(null);

    useImperativeHandle(forwardedRef, () => sheetRef.current as BottomSheet);

    const featureLabel = FEATURE_LABELS[feature] ?? UNKNOWN_FEATURE_LABEL;
    const tierLabel = tierLabelFor(requiredTier);

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

    const handleChooseStandardModel = useCallback(() => {
      sheetRef.current?.close();
      onChooseStandardModel?.();
    }, [onChooseStandardModel]);

    const showPlanComparison = recoveryAction === 'upgrade' || recoveryAction === 'subscribe';
    const handleComparePlans = useCallback(() => {
      sheetRef.current?.close();
      router.push('/(app)/settings/plans' as Parameters<typeof router.push>[0]);
    }, [router]);

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
                  fontSize: typeScale.headline,
                  fontWeight: '600',
                  color: colors.textPrimary,
                  flex: 1,
                  flexWrap: 'wrap',
                }}
              >
                {title}
              </Text>
            </View>

            {/* Close button, 44pt touch target per iOS HIG */}
            <PressableBox
              onPress={handleDismiss}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              accessibilityLabel="Dismiss"
              accessibilityRole="button"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <X size={20} color={colors.textSecondary} />
            </PressableBox>
          </View>

          {/* Body copy */}
          <Text
            style={{
              fontSize: typeScale.body,
              color: colors.textSecondary,
              lineHeight: 22,
              marginBottom: reason || resetLabel ? 8 : 20,
            }}
          >
            {body}
          </Text>

          {reason || resetLabel ? (
            <View style={{ gap: 4, marginBottom: 20 }}>
              {reason ? (
                <Text
                  style={{ fontSize: typeScale.footnote, color: colors.textMuted, lineHeight: 20 }}
                >
                  {reason}
                </Text>
              ) : null}
              {resetLabel ? (
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    color: colors.textSecondary,
                    lineHeight: 20,
                  }}
                >
                  {resetLabel}
                </Text>
              ) : null}
            </View>
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
                fontSize: typeScale.footnote,
                color: colors.textMuted,
                lineHeight: 20,
                marginBottom: 4,
              }}
            >
              {primaryActionUnavailableMessage}
            </Text>
          )}
          {onChooseStandardModel ? (
            <PressableBox
              onPress={handleChooseStandardModel}
              style={{
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 8,
              }}
              accessibilityLabel="Choose a standard model"
              accessibilityRole="button"
            >
              <Text
                style={{
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
              >
                Choose a standard model
              </Text>
            </PressableBox>
          ) : null}
          {showPlanComparison ? (
            <PressableBox
              onPress={handleComparePlans}
              style={{
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 8,
              }}
              accessibilityLabel="Compare plans"
              accessibilityRole="button"
            >
              <Text
                style={{
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
              >
                Compare plans
              </Text>
            </PressableBox>
          ) : null}
          <PressableBox
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
            <Text style={{ fontSize: typeScale.subhead, color: colors.textMuted }}>Try later</Text>
          </PressableBox>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

PaywallBottomSheet.displayName = 'PaywallBottomSheet';

export type { BottomSheet as PaywallBottomSheetHandle };
