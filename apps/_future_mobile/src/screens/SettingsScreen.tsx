import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { useSyncStore } from '../store/syncStore';
import { useConnectionStore } from '../store/connectionStore';
import { PairingModal } from './Pairing';

export function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const { pushToken, permissionGranted, registerPush } = useNotificationStore();
  const { clear } = useSyncStore();
  const connectionState = useConnectionStore((state) => ({
    status: state.status,
    pairing: state.pairing,
    disconnect: state.disconnect,
  }));
  const [pairingVisible, setPairingVisible] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.cardMeta}>Signed in as {user?.email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mobile Companion</Text>
        <Text style={styles.cardMeta}>
          {connectionState.status === 'connected'
            ? 'Paired with desktop'
            : 'Not paired. Scan a QR code from the desktop app to connect.'}
        </Text>
        {connectionState.pairing && (
          <Text style={styles.tokenLabel}>
            Code {connectionState.pairing.code} via {connectionState.pairing.wsUrl}
          </Text>
        )}
        <View style={styles.row}>
          <TouchableOpacity style={styles.button} onPress={() => setPairingVisible(true)}>
            <Text style={styles.buttonText}>
              {connectionState.status === 'connected' ? 'Re-pair desktop' : 'Pair new desktop'}
            </Text>
          </TouchableOpacity>
          {connectionState.status !== 'idle' && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => connectionState.disconnect()}
            >
              <Text style={styles.secondaryButtonText}>Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notifications</Text>
        <Text style={styles.cardMeta}>{permissionGranted ? 'Push enabled' : 'Push disabled'}</Text>
        {pushToken && <Text style={styles.tokenLabel}>{pushToken}</Text>}
        <TouchableOpacity style={styles.button} onPress={() => registerPush()}>
          <Text style={styles.buttonText}>Refresh push token</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Data</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => clear()}>
          <Text style={styles.secondaryButtonText}>Clear sync cache</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.dangerButton} onPress={() => logout()}>
        <Text style={styles.dangerButtonText}>Sign out</Text>
      </TouchableOpacity>

      <PairingModal visible={pairingVisible} onRequestClose={() => setPairingVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    color: '#0f172a',
  },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  cardMeta: {
    color: '#64748b',
  },
  tokenLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  button: {
    flexShrink: 0,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  buttonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  secondaryButton: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  secondaryButtonText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  dangerButton: {
    marginTop: 'auto',
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
});
