import type { CaptureResult } from './capture';

export interface BoundingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AutomationElementInfo {
  id: string;
  name: string;
  className: string;
  controlType: string;
  boundingRect?: BoundingRect | null;
}

export interface AutomationQuery {
  parentId?: string;
  window?: string;
  windowClass?: string;
  name?: string;
  className?: string;
  automationId?: string;
  controlType?: string;
  maxResults?: number;
}

export interface AutomationClickRequest {
  elementId?: string;
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
}

export interface AutomationScreenshotOptions {
  elementId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  conversationId?: number;
}

export type AutomationScreenshotResult = CaptureResult;

export interface AutomationOcrResult {
  text: string;
  confidence: number;
}

export interface OverlayClickPayload {
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
}

export interface OverlayTypePayload {
  x: number;
  y: number;
  text: string;
}

export interface OverlayRegionPayload {
  x: number;
  y: number;
  width: number;
  height: number;
}
