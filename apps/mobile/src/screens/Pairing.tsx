import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BarCodeScanner, type BarCodeScannerResult } from 'expo-barcode-scanner';
import { useConnectionStore } from '../store/connectionStore';
import { parsePairingPayload } from '../services/signaling';

interface PairingModalProps {
  visible: boolean;
  onRequestClose: () => void;
}

export function PairingModal({ visible, onRequestClose }: PairingModalProps) {
  const { connect, connectFromPayload, status, pairing, error, clearError } = useConnectionStore(
    (state) => ({
      connect: state.connect,
      connectFromPayload: state.connectFromPayload,
      status: state.status,
      pairing: state.pairing,
      error: state.error,
      clearError: state.clearError,
    }),
  );
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let mounted = true;
    const requestPermission = async () => {
      const { status: cameraStatus } = await BarCodeScanner.requestPermissionsAsync();
      if (mounted) {
        setHasPermission(cameraStatus === 'granted');
      }
    };
    void requestPermission();
    return () => {
      mounted = false;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setScanned(false);
      setHasPermission(null);
      clearError();
    }
  }, [visible, clearError]);

  const handleBarcode = (result: BarCodeScannerResult) => {
    if (scanned) {
      return;
    }
    setScanned(true);
    const parsed = parsePairingPayload(result.data);
    if (!parsed) {
      connectFromPayload(result.data); // will set error
      return;
    }
    connect(parsed);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onRequestClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Pair your desktop</Text>
        <Text style={styles.subtitle}>
          Point your camera at the QR code shown in the AGI Workforce desktop app. We&apos;ll
          automatically fill in the pairing code and connect to the signaling server.
        </Text>

        {hasPermission === null && (
          <View style={styles.loader}>
            <ActivityIndicator color="#2563eb" />
            <Text style={styles.loaderText}>Requesting camera access…</Text>
          </View>
        )}

        {hasPermission === false && (
          <View style={styles.permissionError}>
            <Text style={styles.permissionText}>
              Camera permission denied. Enable camera access in system settings to scan pairing
              codes.
            </Text>
          </View>
        )}

        {hasPermission && (
          <View style={styles.scannerContainer}>
            <BarCodeScanner
              style={StyleSheet.absoluteFillObject}
              onBarCodeScanned={handleBarcode}
            />
            {!scanned ? (
              <View style={styles.overlayLabel}>
                <Text style={styles.overlayText}>Align the QR code inside the frame</Text>
              </View>
            ) : (
              <View style={styles.overlayLabel}>
                <Text style={styles.overlayText}>
                  {status === 'connected' ? 'Connected!' : 'Processing pairing details…'}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Connection status</Text>
          <Text style={styles.statusValue}>{status}</Text>
          {pairing && (
            <Text style={styles.statusMeta}>
              Code {pairing.code} via {pairing.wsUrl}
            </Text>
          )}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => {
              setScanned(false);
              clearError();
            }}
          >
            <Text style={styles.secondaryText}>Scan again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={onRequestClose}
          >
            <Text style={styles.primaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
    backgroundColor: '#0f172a',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 14,
    color: '#cbd5f5',
  },
  loader: {
    marginTop: 32,
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    color: '#e2e8f0',
  },
  permissionError: {
    marginTop: 32,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fda4af',
    backgroundColor: '#ffe4e6',
  },
  permissionText: {
    color: '#be123c',
    textAlign: 'center',
  },
  scannerContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2563eb',
    backgroundColor: '#020617',
  },
  overlayLabel: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#020617aa',
  },
  overlayText: {
    color: '#f8fafc',
    textAlign: 'center',
    fontWeight: '600',
  },
  statusCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#020617',
    padding: 16,
    gap: 4,
  },
  statusLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#64748b',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  statusMeta: {
    fontSize: 12,
    color: '#94a3b8',
  },
  errorText: {
    fontSize: 12,
    color: '#f87171',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
  },
  secondaryText: {
    color: '#60a5fa',
    fontWeight: '600',
  },
  primaryText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
});
