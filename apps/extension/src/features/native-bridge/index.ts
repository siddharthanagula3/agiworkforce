/**
 * native-bridge feature barrel.
 *
 * Desktop bridge protocol: HTTP/native-messaging to port 8787.
 * Bridge URL: http://localhost:8787 (default; user-overridable via
 * chrome.storage.local `agi_bridge_url`).
 *
 * Exports:
 *   - pairing: desktop ↔ extension pairing state machine (POST /pair)
 *   - sendQueue: chrome.storage-backed send-pipeline queue
 */
export * from './pairing';
export * from './sendQueue';
