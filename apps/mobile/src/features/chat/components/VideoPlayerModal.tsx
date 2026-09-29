import { Alert, Modal, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useThemeColors } from '@/src/ui/theme';
import type { LocalVideoPlayer } from '@/services/fileCreation';

export interface VideoPlayerModalProps {
  player: LocalVideoPlayer | null;
  visible: boolean;
  onClose: () => void;
  label: string;
  failureHint: string;
}

export function VideoPlayerModal({
  player,
  visible,
  onClose,
  label,
  failureHint,
}: VideoPlayerModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible && player !== null}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
      accessibilityViewIsModal
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.black }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8 }}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close video"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={22} color={colors.white} />
          </Pressable>
        </View>
        {player ? (
          <WebView
            source={{ uri: player.playerUri }}
            style={{ flex: 1, backgroundColor: colors.black }}
            originWhitelist={['*']}
            allowingReadAccessToURL={player.directoryUri}
            allowFileAccess
            allowFileAccessFromFileURLs
            javaScriptEnabled={false}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            onShouldStartLoadWithRequest={(request) => request.url === player.playerUri}
            onError={() => {
              onClose();
              Alert.alert('Could not play the video', failureHint);
            }}
            accessibilityLabel={label}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
