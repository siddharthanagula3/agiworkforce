import type { AgiworkforceErrorInfo } from './AgiworkforceErrorInfo';

export type StreamErrorEvent = {
  message: string;
  agiworkforce_error_info: AgiworkforceErrorInfo | null;
  additional_details: string | null;
};
