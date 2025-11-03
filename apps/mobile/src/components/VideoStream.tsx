
import { View, Text, StyleSheet } from 'react-native';

interface VideoStreamProps {
  isConnected: boolean;
}

export function VideoStream({ isConnected }: VideoStreamProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.status}>
        {isConnected
          ? 'Live stream ready (placeholder). Screen sharing will appear here.'
          : 'Connect to a desktop to enable screen streaming.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 16,
    padding: 24,
    backgroundColor: '#0f172a',
  },
  status: {
    color: '#e2e8f0',
    textAlign: 'center',
  },
});
