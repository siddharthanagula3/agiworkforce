/**
 * features/sidebar-webview/ — AGI Workforce sidebar panel.
 * SidebarProvider: WebviewViewProvider wiring webview lifecycle to ChatStateManager.
 * ChatStateManager: message-protocol router and streaming state.
 * webviewContent: shared HTML/CSS template for sidebar and chat-editor panels.
 */
export { SidebarProvider } from './sidebarProvider';
export { ChatStateManager } from './ChatStateManager';
export { getWebviewContent, getNonce, escapeHtml } from './webviewContent';
export type {
  WebviewToExtMessage,
  ExtToWebviewMessage,
  UsageMeterWebviewPayload,
} from './ChatStateManager';
