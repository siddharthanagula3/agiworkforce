import { useMemo } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useDeviceStore } from '../store/deviceStore';
import { useSyncStore } from '../store/syncStore';
import { CommandBar } from '../components/CommandBar';
import { TouchPad } from '../components/TouchPad';
import { VideoStream } from '../components/VideoStream';
import { useConnectionStore } from '../store/connectionStore';

const QUICK_ACTIONS = [
  { label: 'Lock Screen', payload: { type: 'automation', action: 'lock_screen' } },
  { label: 'Mute Audio', payload: { type: 'automation', action: 'mute_system' } },
  { label: 'Screenshot', payload: { type: 'automation', action: 'capture_screen' } },
  { label: 'New Chat', payload: { type: 'chat', action: 'start_conversation' } },
];

export function RemoteControlScreen() {
  const { selectedDeviceId, devices, sendQuickAction } = useDeviceStore();
  const { push } = useSyncStore();
  const { status, dataChannelReady, sendControl } = useConnectionStore((state) => ({
    status: state.status,
    dataChannelReady: state.dataChannelReady,
    sendControl: state.sendControl,
  }));

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId),
    [devices, selectedDeviceId],
  );

  const handleCommand = async (payload: Record<string, unknown>) => {
    try {
      await sendQuickAction({
        type: (payload['type'] as 'chat' | 'automation' | 'query') ?? 'automation',
        payload,
      });
      await push('command', { payload, deviceId: selectedDeviceId ?? 'mobile' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute command';
      Alert.alert('Command failed', message);
    }
  };

  const handleGesture = (event: { type: string; deltaX?: number; deltaY?: number }) => {
    void push('gesture', {
      kind: event.type,
      deltaX: event.deltaX ?? 0,
      deltaY: event.deltaY ?? 0,
      deviceId: selectedDeviceId ?? 'mobile',
    });
    if (dataChannelReady) {
      try {
        sendControl({
          kind: event.type,
          deltaX: event.deltaX ?? 0,
          deltaY: event.deltaY ?? 0,
          timestamp: Date.now(),
        });
      } catch (controlError) {
        console.warn('[remote] failed to send control event', controlError);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {selectedDevice ? `Controlling ${selectedDevice.name}` : 'Select a desktop to begin'}
      </Text>
      <Text style={styles.subheading}>
        Connection status: {status}
        {dataChannelReady ? ' — control channel ready' : ''}
      </Text>

      <CommandBar actions={QUICK_ACTIONS} onAction={handleCommand} />
      <TouchPad onGesture={handleGesture} />
      <VideoStream isConnected={status === 'connected'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  subheading: {
    fontSize: 12,
    color: '#64748b',
  },
});
