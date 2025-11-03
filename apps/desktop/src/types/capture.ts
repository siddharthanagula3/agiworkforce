export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureMetadata {
  width: number;
  height: number;
  windowTitle?: string | null;
  region?: Region | null;
  screenIndex?: number | null;
}

export type CaptureType = 'fullscreen' | 'window' | 'region';

export interface CaptureResult {
  id: string;
  path: string;
  thumbnailPath?: string | null;
  captureType: CaptureType;
  metadata: CaptureMetadata;
  createdAt: number;
}

export interface CaptureRecord {
  id: string;
  conversationId?: number | null;
  captureType: string;
  filePath: string;
  thumbnailPath?: string | null;
  ocrText?: string | null;
  ocrConfidence?: number | null;
  metadata: string;
  createdAt: number;
}

export interface WindowInfo {
  handle: string;
  title: string;
  process: string;
}
