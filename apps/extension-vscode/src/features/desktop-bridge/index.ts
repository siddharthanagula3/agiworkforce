/**
 * features/desktop-bridge/ — Port 8787 WebSocket bridge to the AGI Workforce desktop app.
 * Handles auth handshake, exponential backoff reconnect, allowlisted message types,
 * and graceful degradation when the desktop app is not running.
 */
export {
  DesktopBridge,
  activateDesktopBridge,
  getDesktopBridge,
  getDesktopTokenPaths,
  readBridgeToken,
} from './desktopBridge';
export type { BridgeStatus } from './desktopBridge';
