/**
 * native-bridge feature barrel.
 *
 * Desktop bridge protocol: HTTP/native-messaging to port 8787.
 * Bridge URL: http://localhost:8787 (default; user-overridable via
 * chrome.storage.local `agi_bridge_url`).
 *
 * Exports:
 *   - pairing: desktop ↔ extension pairing state machine (POST /pair)
 *   - providerStreamClient: SSE stream client (api-gateway bridge)
 *   - sendQueue: chrome.storage-backed send-pipeline queue
 */
export * from './pairing';
export * from './providerStreamClient';
export * from './sendQueue';
