import { View, Text, StyleSheet } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useConnectionStore } from '../store/connectionStore';

interface VideoStreamProps {
  isConnected: boolean;
}

export function VideoStream({ isConnected }: VideoStreamProps) {
  const remoteStream = useConnectionStore((state) => state.remoteStream);

  return (
    <View style={styles.container}>
      {remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.video}
          objectFit="contain"
          zOrder={0}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.status}>
            {isConnected
              ? 'Waiting for screen broadcast to start…'
              : 'Connect to a desktop to enable screen streaming.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 16,
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    minHeight: 220,
  },
  video: {
    width: '100%',
    height: 220,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  status: {
    color: '#e2e8f0',
    textAlign: 'center',
  },
});
