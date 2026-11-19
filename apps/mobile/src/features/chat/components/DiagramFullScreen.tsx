import { Modal, View } from 'react-native';
import { X } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useDismissOnScreenBlur } from '@/src/features/artifacts/useDismissOnScreenBlur';
import { useFullScreenChrome } from '@/src/features/chat/chrome/fullScreenChrome';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { DiagramSourceControls } from './DiagramSourceControls';
import { MermaidDiagramView } from './MermaidDiagramView';
import { ModalSafeArea } from './ModalSafeArea';

const ICON_SIZE = 20;
const CLOSE_LABEL = 'Close';

interface DiagramFullScreenProps {
  visible: boolean;
  source: string;
  onClose: () => void;
}

export function DiagramFullScreen({ visible, source, onClose }: DiagramFullScreenProps) {
  const colors = useThemeColors();
  const chrome = useFullScreenChrome({
    surface: 'diagram-full-screen',
    back: { onPress: onClose, label: CLOSE_LABEL },
    close: { onPress: onClose, label: CLOSE_LABEL },
  });
  useDismissOnScreenBlur(visible, onClose);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={chrome.onRequestClose}
      accessibilityViewIsModal
    >
      <ModalSafeArea
        testID="diagram-full-screen"
        style={{ flex: 1, backgroundColor: colors.surfaceBase }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: spacing.lg,
            paddingRight: spacing.xs,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              fontSize: typeScale.callout,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
          >
            Diagram
          </Text>
          <DiagramSourceControls
            source={source}
            color={colors.textSecondary}
            iconSize={ICON_SIZE}
          />
          <PressableBox
            {...chrome.close}
            style={{ ...chrome.close.style, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={ICON_SIZE} color={colors.textSecondary} />
          </PressableBox>
        </View>
        {visible ? <MermaidDiagramView source={source} fitToWidth style={{ flex: 1 }} /> : null}
      </ModalSafeArea>
    </Modal>
  );
}
