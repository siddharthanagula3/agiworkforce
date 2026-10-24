import { useState } from 'react';
import { Alert, Modal, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Flag, X } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useThemeColors } from '@/src/ui/theme';
import type { LocalVideoPlayer } from '@/services/fileCreation';
import { ReportSheet, type ReportTarget } from './ReportFlagButton';

export interface VideoPlayerModalProps {
  player: LocalVideoPlayer | null;
  visible: boolean;
  onClose: () => void;
  label: string;
  failureHint: string;
  reportTarget?: ReportTarget;
}

export function VideoPlayerModal({
  player,
  visible,
  onClose,
  label,
  failureHint,
  reportTarget,
}: VideoPlayerModalProps) {
  const colors = useThemeColors();
  const [reporting, setReporting] = useState(false);

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
        {reportTarget && reporting ? (
          <ReportSheet
            visible
            onClose={() => setReporting(false)}
            title="Report this video"
            target={reportTarget}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
