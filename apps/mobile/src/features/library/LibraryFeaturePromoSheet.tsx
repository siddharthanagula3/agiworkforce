import { useCallback } from 'react';
import { Modal, View } from 'react-native';
import { X } from 'lucide-react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { helpArticleUrl } from '@/src/features/support/HelpArticleLink';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const PROMO_STORE_NAME = 'library-feature-promo';

export const LIBRARY_PROMO_TITLE = 'Reuse files from any chat';
export const LIBRARY_PROMO_BODY =
  'Everything you upload or generate is saved here, ready to attach again.';

interface LibraryPromoState {
  hydrated: boolean;
  seen: boolean;
  markSeen: () => void;
}

export const useLibraryPromoStore = create<LibraryPromoState>()(
  persist(
    (set) => ({
      hydrated: false,
      seen: false,
      markSeen: () => set({ seen: true }),
    }),
    {
      name: PROMO_STORE_NAME,
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (state) => ({ seen: state.seen }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[library-feature-promo] Hydration failed:', error);
        useLibraryPromoStore.setState({ hydrated: true });
      },
    },
  ),
);

rehydrateWhenMmkvReady(useLibraryPromoStore, PROMO_STORE_NAME);

export function LibraryFeaturePromoSheet() {
  const colors = useThemeColors();
  const visible = useLibraryPromoStore((state) => state.hydrated && !state.seen);
  const markSeen = useLibraryPromoStore((state) => state.markSeen);

  const handleLearnMore = useCallback(() => {
    markSeen();
    void openUntrustedUrlInAppBrowser(helpArticleUrl('library'));
  }, [markSeen]);

  return (
    <Modal
      animationType="slide"
      transparent
      statusBarTranslucent
      visible={visible}
      onRequestClose={markSeen}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          testID="library-promo-scrim"
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={markSeen}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: colors.scrim,
          }}
        />
        <View
          testID="library-promo-sheet"
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 32,
            gap: 12,
          }}
        >
          <View style={{ alignItems: 'flex-end' }}>
            <Pressable
              testID="library-promo-close"
              onPress={markSeen}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceHover,
              }}
            >
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.title2,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {LIBRARY_PROMO_TITLE}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typeScale.callout,
              lineHeight: 22,
              textAlign: 'center',
              paddingHorizontal: 12,
            }}
          >
            {LIBRARY_PROMO_BODY}
          </Text>
          <Button
            title="Learn more"
            size="lg"
            onPress={handleLearnMore}
            style={{ marginTop: 12, borderRadius: 999, backgroundColor: colors.textPrimary }}
          />
        </View>
      </View>
    </Modal>
  );
}
