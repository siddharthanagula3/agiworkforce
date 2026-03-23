import type { CaptureResult } from '../types/capture';

export const CHAT_COMPOSER_CAPTURE_EVENT = 'chat:composer-capture-request';

export interface ChatComposerCaptureRequestDetail {
  captureResult?: CaptureResult | null;
}
