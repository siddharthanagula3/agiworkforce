import { useCallback, useContext, useEffect, useState } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { Alert, Modal, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Download, Flag, X } from 'lucide-react-native';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useDismissOnScreenBlur } from '@/src/features/artifacts/useDismissOnScreenBlur';
import { useLandscapeWhileOpen } from '@/src/shared/hooks/useLandscapeWhileOpen';
import { useThemeColors } from '@/src/ui/theme';
import type { LocalVideoPlayer } from '@/services/fileCreation';
import { ModalSafeArea } from './ModalSafeArea';
import { ReportSheet, type ReportTarget } from './ReportFlagButton';

export interface VideoPlayerModalProps {
  player: LocalVideoPlayer | null;
  visible: boolean;
  onClose: () => void;
  label: string;
  failureHint: string;
  reportTarget?: ReportTarget;
  onPlaybackError?: () => void;
  onSave?: () => void;
  saving?: boolean;
}

export function VideoPlayerModal({
  player,
  visible,
  onClose,
  label,
  failureHint,
  reportTarget,
  onPlaybackError,
  onSave,
  saving = false,
}: VideoPlayerModalProps) {
  const colors = useThemeColors();
  const [reporting, setReporting] = useState(false);
  const navigation = useContext(NavigationContext);
  const shown = visible && player !== null;
  const close = useCallback(() => {
    setReporting(false);
    onClose();
  }, [onClose]);
  useDismissOnScreenBlur(shown, close);
  useLandscapeWhileOpen(shown);
  useEffect(() => {
    if (shown && navigation && !navigation.isFocused()) close();
  }, [close, navigation, shown]);

  return (
    <Modal
      visible={shown}
      animationType="fade"
      onRequestClose={close}
      supportedOrientations={['portrait', 'landscape']}
      accessibilityViewIsModal
    >
      <ModalSafeArea testID="video-player" style={{ flex: 1, backgroundColor: colors.black }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8 }}>
          {onSave ? (
            <Pressable
              onPress={onSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save video"
              accessibilityHint="Opens the share sheet to save or send the video"
              accessibilityState={{ busy: saving, disabled: saving }}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              {saving ? (
                <LoadingIndicator size="small" />
              ) : (
                <Download size={20} color={colors.white} />
              )}
            </Pressable>
          ) : null}
          {reportTarget ? (
            <Pressable
              onPress={() => setReporting(true)}
              accessibilityRole="button"
              accessibilityLabel="Report this video"
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Flag size={20} color={colors.white} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={close}
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
              if (onPlaybackError) {
                onPlaybackError();
                return;
              }
              close();
              Alert.alert('Could not play the video', failureHint);
            }}
            accessibilityLabel={label}
          />
        ) : null}
        {reportTarget && reporting ? (
          <ReportSheet
            visible
            onClose={() => setReporting(false)}
            title="Report this video"
            target={reportTarget}
          />
        ) : null}
      </ModalSafeArea>
    </Modal>
  );
}
