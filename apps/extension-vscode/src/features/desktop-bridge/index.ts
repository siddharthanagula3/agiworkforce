/**
 * features/desktop-bridge/ — Port 8787 WebSocket + HTTP bridge to the AGI Workforce desktop app.
 * Handles auth handshake, exponential backoff reconnect, allowlisted message types,
 * and graceful degradation when the desktop app is not running.
 */
export {
  DesktopBridge,
  activateDesktopBridge,
  getDesktopBridge,
  getBridgeAuthHeaders,
  readBridgeToken,
  ALLOWED_OUTBOUND_TYPES,
  ALLOWED_INBOUND_TYPES,
  ALLOWED_BRIDGE_COMMANDS,
} from './desktopBridge';
export type {
  DesktopBridgeConfig,
  BridgeMessage,
  BridgeResponse,
  BridgeMessageHandler,
  BridgeStatus,
} from './desktopBridge';
