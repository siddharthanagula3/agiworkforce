/**
 * ProPlusPaywall
 *
 * Bottom-sheet paywall shown when a user below Pro+ attempts to switch
 * providers mid-thread.  Mirrors the visual style of PaywallBottomSheet
 * (in components/chat/PaywallBottomSheet.tsx) but is specialised for the
 * multi-provider gate:
 *
 *   Headline:  "Pro+ unlocks multi-provider chat"
 *   CTA:       "Upgrade — $49.99/mo" → opens /pricing?from=mobile-provider-switch
 *   Secondary: "Maybe later" → dismisses
 *
 * Usage (inside a screen that hosts a BottomSheet portal):
 *
 *   const proRef = useRef<BottomSheet>(null);
 *   <ProPlusPaywall ref={proRef} onDismiss={() => proRef.current?.close()} />
 *   // To show:
 *   proRef.current?.expand();
 */

import { useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Pressable } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { ArrowUpCircle, X, Shuffle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { colors } from '@/lib/theme';
import { openExternalUrl } from '@/lib/safeOpenURL';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRO_PLUS_PRICE = '$49.99/mo';

/** UTM-tagged pricing URL for this specific paywall placement. */
const PRICING_URL =
  'https://agiworkforce.com/pricing?from=mobile-provider-switch&tier=pro_plus&feature=multi_provider';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProPlusPaywallProps {
  /** Called when the sheet is dismissed (via close button or "Maybe later"). */
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ProPlusPaywall wraps @gorhom/bottom-sheet.
 * The caller controls open/close via a ref.
 */
export const ProPlusPaywall = forwardRef<BottomSheet, ProPlusPaywallProps>(
  function ProPlusPaywallInner({ onDismiss }, forwardedRef) {
    const sheetRef = useRef<BottomSheet>(null);

    useImperativeHandle(forwardedRef, () => sheetRef.current as BottomSheet);

    const snapPoints = useMemo(() => ['auto'], []);

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
      const opened = await openExternalUrl(PRICING_URL);
      if (!opened && __DEV__) {
        console.warn('[ProPlusPaywall] openExternalUrl refused:', PRICING_URL);
      }
    }, []);

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
              {/* Layered icon: upgrade arrow + shuffle to signal multi-provider */}
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
                Pro+ unlocks multi-provider chat
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
              marginBottom: 20,
            }}
          >
            Switch between Claude, GPT, Gemini and more — all within the same conversation.
            Multi-provider chat requires the Pro+ plan.
          </Text>

          {/* Benefit pills */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 24,
            }}
          >
            {['10+ providers', 'Mid-thread switching', 'Cross-provider context'].map((benefit) => (
              <View
                key={benefit}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Shuffle size={11} color={colors.teal} />
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>{benefit}</Text>
              </View>
            ))}
          </View>

          {/* Primary CTA */}
          <Button
            title={`Upgrade — ${PRO_PLUS_PRICE}`}
            variant="primary"
            size="md"
            onPress={handleUpgrade}
            accessibilityLabel="Upgrade to Pro+ plan"
          />

          {/* Secondary dismiss */}
          <Pressable
            onPress={handleDismiss}
            style={{
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 8,
            }}
            accessibilityLabel="Maybe later"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Maybe later</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

ProPlusPaywall.displayName = 'ProPlusPaywall';

/** Re-export the BottomSheet ref type so callers can type their ref. */
export type { BottomSheet as ProPlusPaywallHandle };
