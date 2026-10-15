import type { CaptureMetadata, CaptureResult, Region } from '../types/capture';

interface RawRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RawCaptureMetadata {
  width: number;
  height: number;
  window_title?: string | null;
  region?: RawRegion | null;
  screen_index?: number | null;
}

interface RawCaptureResult {
  id: string;
  path: string;
  thumbnail_path?: string | null;
  capture_type: 'fullscreen' | 'window' | 'region';
  metadata: RawCaptureMetadata;
  created_at: number;
}

function normalizeRegion(region?: RawRegion | null): Region | null {
  if (!region) {
    return null;
  }

  return {
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  };
}

function normalizeMetadata(metadata: RawCaptureMetadata): CaptureMetadata {
  return {
    width: metadata.width,
    height: metadata.height,
    windowTitle: metadata.window_title ?? null,
    region: normalizeRegion(metadata.region),
    screenIndex: metadata.screen_index ?? null,
  };
}

export function normalizeCaptureResult(raw: RawCaptureResult): CaptureResult {
  return {
    id: raw.id,
    path: raw.path,
    thumbnailPath: raw.thumbnail_path ?? null,
    captureType: raw.capture_type,
    metadata: normalizeMetadata(raw.metadata),
    createdAt: raw.created_at,
  };
}

export type { RawCaptureResult };
