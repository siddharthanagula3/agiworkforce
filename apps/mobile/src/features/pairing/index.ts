/**
 * Pairing feature — QR code scanning, ECDH key exchange, persistent reconnection.
 */

export { QRScanScreen } from './QRScanScreen';
export { usePairing, type PairingState } from './usePairing';
export {
  parseQRPayload,
  isValidPairingCode,
  initiatePairing,
  attemptReconnection,
  completeKeyExchange,
  unpair,
  persistPairing,
  loadPersistedPairing,
  clearPersistedPairing,
  generateKeyPair,
  deriveSharedSecret,
  type QRPayload,
  type PersistedPairing,
  type KeyExchangeState,
} from './PairingService';
