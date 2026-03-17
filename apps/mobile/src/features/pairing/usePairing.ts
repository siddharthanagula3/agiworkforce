/**
 * usePairing — React hook to manage QR pairing connection state.
 *
 * Provides a unified interface for:
 * - Scanning QR codes and initiating pairing
 * - Monitoring connection status
 * - Auto-reconnection on app resume
 * - Key exchange tracking
 * - Disconnecting / unpairing
 *
 * Usage:
 * ```tsx
 * function PairingScreen() {
 *   const {
 *     status, desktopName, error,
 *     scan, disconnect, reconnect,
 *     isEncrypted, clearError,
 *   } = usePairing();
 *
 *   return <QRScanner onScan={scan} />;
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  useConnectionStore,
  type ConnectionStatus,
  type DesktopMetadata,
} from '@/stores/connectionStore';
import {
  initiatePairing,
  attemptReconnection,
  unpair,
  completeKeyExchange,
  parseQRPayload,
  isValidPairingCode,
  loadPersistedPairing,
  type KeyExchangeState,
} from './PairingService';
import { startHealthChecks, stopHealthChecks, requestAgentRefresh } from '@/services/companion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PairingState {
  /** Current connection status */
  status: ConnectionStatus;
  /** Connected desktop device name */
  desktopName: string | null;
  /** Full desktop metadata (platform, version, OS, etc.) */
  desktopMetadata: DesktopMetadata | null;
  /** Human-readable error message */
  error: string | null;
  /** Whether the data channel is encrypted with exchanged keys */
  isEncrypted: boolean;
  /** Whether a reconnection attempt is in progress */
  isReconnecting: boolean;
  /** Session expiry timestamp */
  sessionExpiresAt: number | null;
  /** Whether there is a persisted pairing available for reconnection */
  hasPersistedPairing: boolean;

  /** Scan a QR code and initiate pairing */
  scan: (qrData: string) => Promise<{ success: boolean; error?: string }>;
  /** Connect with a raw pairing code (manual entry) */
  connectWithCode: (code: string) => void;
  /** Disconnect from the desktop */
  disconnect: () => void;
  /** Fully unpair and clear all stored pairing data */
  unpairDevice: () => Promise<void>;
  /** Attempt reconnection using persisted pairing */
  reconnect: () => Promise<boolean>;
  /** Clear the current error */
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePairing(): PairingState {
  const status = useConnectionStore((s) => s.status);
  const desktopName = useConnectionStore((s) => s.desktopName);
  const desktopMetadata = useConnectionStore((s) => s.desktopMetadata);
  const error = useConnectionStore((s) => s.error);
  const pairingCode = useConnectionStore((s) => s.pairingCode);
  const sessionExpiresAt = useConnectionStore((s) => s.sessionExpiresAt);
  const connect = useConnectionStore((s) => s.connect);
  const disconnectStore = useConnectionStore((s) => s.disconnect);
  const clearErrorStore = useConnectionStore((s) => s.clearError);

  const [isEncrypted, setIsEncrypted] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [hasPersistedPairing, setHasPersistedPairing] = useState(false);

  const keyExchangeRef = useRef<KeyExchangeState | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Check for persisted pairing on mount
  useEffect(() => {
    loadPersistedPairing().then((pairing) => {
      setHasPersistedPairing(pairing !== null);
    });
  }, []);

  // Start/stop health checks based on connection status
  useEffect(() => {
    if (status === 'connected') {
      startHealthChecks();
      requestAgentRefresh();
    } else {
      stopHealthChecks();
    }
    return () => {
      stopHealthChecks();
    };
  }, [status]);

  // Auto-reconnect when app comes back to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      // App came to foreground from background
      if (
        previousState.match(/inactive|background/) &&
        nextState === 'active' &&
        status === 'disconnected' &&
        pairingCode
      ) {
        // Attempt reconnection with the stored code
        connect(pairingCode);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [status, pairingCode, connect]);

  // Listen for key_exchange control messages
  useEffect(() => {
    const unsubscribe = useConnectionStore.subscribe((state) => {
      // The connectionStore dispatches control messages via handleControlMessage.
      // We intercept key_exchange by checking if the desktop metadata contains
      // an encryption key. In practice, the key_exchange control message is
      // handled in connectionStore's handleControlMessage switch.
      if (state.desktopMetadata?.encryptionKey && keyExchangeRef.current) {
        const peerKey = state.desktopMetadata.encryptionKey as string;
        completeKeyExchange(keyExchangeRef.current, peerKey).then(() => {
          setIsEncrypted(true);
        });
      }
    });

    return unsubscribe;
  }, []);

  const scan = useCallback(
    async (qrData: string): Promise<{ success: boolean; error?: string }> => {
      const result = await initiatePairing(qrData);
      if (result.keyExchange) {
        keyExchangeRef.current = result.keyExchange;
      }
      return result;
    },
    [],
  );

  const connectWithCode = useCallback(
    (code: string) => {
      if (!isValidPairingCode(code)) return;
      connect(code);
    },
    [connect],
  );

  const disconnect = useCallback(() => {
    keyExchangeRef.current = null;
    setIsEncrypted(false);
    disconnectStore();
  }, [disconnectStore]);

  const unpairDevice = useCallback(async () => {
    keyExchangeRef.current = null;
    setIsEncrypted(false);
    setHasPersistedPairing(false);
    await unpair();
  }, []);

  const reconnect = useCallback(async (): Promise<boolean> => {
    setIsReconnecting(true);
    try {
      const result = await attemptReconnection();
      return result;
    } finally {
      setIsReconnecting(false);
    }
  }, []);

  const clearError = useCallback(() => {
    clearErrorStore();
  }, [clearErrorStore]);

  return {
    status,
    desktopName,
    desktopMetadata,
    error,
    isEncrypted,
    isReconnecting,
    sessionExpiresAt,
    hasPersistedPairing,
    scan,
    connectWithCode,
    disconnect,
    unpairDevice,
    reconnect,
    clearError,
  };
}
