/**
 * Cloud Storage API — typed wrappers for cloud_* Tauri commands (Google Drive, Dropbox, OneDrive).
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface CloudOAuthConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  [key: string]: unknown;
}
export interface CloudAuthorizationResponse {
  url: string;
  state: string;
}
export interface CloudCompleteOAuthRequest {
  code: string;
  state: string;
}
export interface CloudAccountResponse {
  accountId: string;
}
export interface CloudAccount {
  id: string;
  provider: string;
  email: string;
  connected: boolean;
}
export interface CloudListRequest {
  accountId: string;
  path?: string;
  [key: string]: unknown;
}
export interface CloudFile {
  id: string;
  name: string;
  path: string;
  size: number;
  isFolder: boolean;
  modifiedAt: string;
}
export interface CloudUploadRequest {
  accountId: string;
  localPath: string;
  remotePath: string;
}
export interface CloudDownloadRequest {
  accountId: string;
  fileId: string;
  localPath: string;
}
export interface CloudPathRequest {
  accountId: string;
  path: string;
}
export interface CloudShareRequest {
  accountId: string;
  fileId: string;
  email?: string;
  role?: string;
}
export interface ShareLink {
  url: string;
  expiresAt?: string;
}

// ---- Commands ----

export async function cloudConnect(config: CloudOAuthConfig): Promise<CloudAuthorizationResponse> {
  return command<CloudAuthorizationResponse>('cloud_connect', { config });
}
export async function cloudCompleteOauth(
  request: CloudCompleteOAuthRequest,
): Promise<CloudAccountResponse> {
  return command<CloudAccountResponse>('cloud_complete_oauth', { request });
}
export async function cloudDisconnect(accountId: string): Promise<void> {
  return command<void>('cloud_disconnect', { accountId });
}
export async function cloudListAccounts(): Promise<CloudAccount[]> {
  return command<CloudAccount[]>('cloud_list_accounts');
}
export async function cloudList(request: CloudListRequest): Promise<CloudFile[]> {
  return command<CloudFile[]>('cloud_list', { request });
}
export async function cloudUpload(request: CloudUploadRequest): Promise<string> {
  return command<string>('cloud_upload', { request });
}
export async function cloudDownload(request: CloudDownloadRequest): Promise<void> {
  return command<void>('cloud_download', { request });
}
export async function cloudDelete(request: CloudPathRequest): Promise<void> {
  return command<void>('cloud_delete', { request });
}
export async function cloudCreateFolder(request: CloudPathRequest): Promise<string> {
  return command<string>('cloud_create_folder', { request });
}
export async function cloudShare(request: CloudShareRequest): Promise<ShareLink> {
  return command<ShareLink>('cloud_share', { request });
}
