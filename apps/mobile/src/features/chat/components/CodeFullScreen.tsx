import type { ReactNode } from 'react';
import { Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useDismissOnScreenBlur } from '@/src/features/artifacts/useDismissOnScreenBlur';
import { useFullScreenChrome } from '@/src/features/chat/chrome/fullScreenChrome';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { PageSheetSafeArea } from '@/src/features/chat/components/ModalSafeArea';
import { SideScrollerRegistry } from '@/src/features/chat/components/SideScroller';
import type { ColorScheme } from '@/src/ui/theme';

const CLOSE_LABEL = 'Close code';

export function CodeFullScreen({
  visible,
  onClose,
  title,
  actions,
  colors,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  actions: ReactNode;
  colors: ColorScheme;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const chrome = useFullScreenChrome({
    surface: 'code-full-screen',
    back: { onPress: onClose, label: CLOSE_LABEL },
    close: { onPress: onClose, label: CLOSE_LABEL },
  });
  useDismissOnScreenBlur(visible, onClose);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={chrome.onRequestClose}
    >
      <PageSheetSafeArea style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          testID="code-full-screen"
          accessibilityViewIsModal
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: spacing.lg,
              paddingRight: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontSize: typeScale.body,
                fontWeight: '600',
                color: colors.textPrimary,
              }}
            >
              {title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {actions}
              <PressableBox
                {...chrome.close}
                style={{ ...chrome.close.style, alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} color={colors.textSecondary} />
              </PressableBox>
            </View>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: spacing.sm }}
            testID="code-full-screen-body"
          >
            <SideScrollerRegistry.Provider value={null}>{children}</SideScrollerRegistry.Provider>
          </ScrollView>
        </View>
      </PageSheetSafeArea>
    </Modal>
  );
}
