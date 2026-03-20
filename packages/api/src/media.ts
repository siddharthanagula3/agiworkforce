/**
 * Media API — typed wrappers for media generation Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface MediaHistoryItem {
  id: string;
  type: string;
  prompt: string;
  url?: string;
  status: string;
  createdAt: string;
}
export interface MediaImageRequest {
  prompt: string;
  model?: string;
  size?: string;
  style?: string;
  [key: string]: unknown;
}
export interface MediaImageResponse {
  id: string;
  url: string;
  revisedPrompt?: string;
}
export interface MediaVideoRequest {
  prompt: string;
  model?: string;
  duration?: number;
  [key: string]: unknown;
}
export interface MediaVideoResponse {
  id: string;
  url: string;
  status: string;
}

// ---- Commands ----

export async function mediaGetHistory(): Promise<MediaHistoryItem[]> {
  return command<MediaHistoryItem[]>('media_get_history');
}
export async function mediaGenerateImage(request: MediaImageRequest): Promise<MediaImageResponse> {
  return command<MediaImageResponse>('media_generate_image', { request });
}
export async function mediaGenerateVideo(request: MediaVideoRequest): Promise<MediaVideoResponse> {
  return command<MediaVideoResponse>('media_generate_video', { request });
}
