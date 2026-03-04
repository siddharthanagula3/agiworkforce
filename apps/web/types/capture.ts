/**
 * Screen capture types for the web app
 */

export interface CaptureResult {
  id?: string;
  imageData?: string;
  path?: string;
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg' | 'webp';
  timestamp?: number;
  error?: string;
}

export interface CaptureOptions {
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export const _stub = true;
export default {};
