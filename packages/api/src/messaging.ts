/**
 * Messaging API — typed wrappers for messaging platform commands (Slack, WhatsApp, Teams, Discord, Telegram, Signal).
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface ConnectSlackRequest {
  token: string;
  teamId?: string;
}
export interface ConnectWhatsAppRequest {
  phoneNumber: string;
  apiKey: string;
}
export interface ConnectTeamsRequest {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}
export interface DiscordConfig {
  token: string;
  [key: string]: unknown;
}
export interface TelegramConfig {
  botToken: string;
  [key: string]: unknown;
}
export interface SignalConfig {
  phoneNumber: string;
  [key: string]: unknown;
}
export interface MessagingConnection {
  id: string;
  platform: string;
  status: string;
  connectedAt: string;
}
export interface SendMessageResponse {
  messageId: string;
  timestamp: string;
}
export interface UnifiedMessage {
  id: string;
  platform: string;
  sender: string;
  content: string;
  timestamp: string;
}
export interface PlatformStatus {
  platform: string;
  connected: boolean;
  error?: string;
}

// ---- Commands ----

export async function connectSlack(request: ConnectSlackRequest): Promise<MessagingConnection> {
  return command<MessagingConnection>('connect_slack', { request });
}
export async function connectWhatsapp(
  request: ConnectWhatsAppRequest,
): Promise<MessagingConnection> {
  return command<MessagingConnection>('connect_whatsapp', { request });
}
export async function connectTeams(request: ConnectTeamsRequest): Promise<MessagingConnection> {
  return command<MessagingConnection>('connect_teams', { request });
}
export async function sendMessage(
  connectionId: string,
  channelId: string,
  text: string,
): Promise<SendMessageResponse> {
  return command<SendMessageResponse>('send_message', { connectionId, channelId, text });
}
export async function getMessagingHistory(
  connectionId: string,
  channelId: string,
  limit: number,
): Promise<UnifiedMessage[]> {
  return command<UnifiedMessage[]>('get_messaging_history', { connectionId, channelId, limit });
}
export async function disconnectPlatform(connectionId: string): Promise<void> {
  return command<void>('disconnect_platform', { connectionId });
}
export async function listMessagingConnections(userId: string): Promise<MessagingConnection[]> {
  return command<MessagingConnection[]>('list_messaging_connections', { userId });
}
export async function messagingConnectDiscord(config: DiscordConfig): Promise<PlatformStatus> {
  return command<PlatformStatus>('messaging_connect_discord', { config });
}
export async function messagingConnectTelegram(config: TelegramConfig): Promise<PlatformStatus> {
  return command<PlatformStatus>('messaging_connect_telegram', { config });
}
export async function messagingConnectSignal(config: SignalConfig): Promise<PlatformStatus> {
  return command<PlatformStatus>('messaging_connect_signal', { config });
}
export async function messagingSend(
  platform: string,
  channelId: string,
  content: string,
): Promise<string> {
  return command<string>('messaging_send', { platform, channelId, content });
}
export async function messagingGetStatus(): Promise<PlatformStatus[]> {
  return command<PlatformStatus[]>('messaging_get_status');
}
export async function messagingDisconnect(platform: string): Promise<void> {
  return command<void>('messaging_disconnect', { platform });
}
