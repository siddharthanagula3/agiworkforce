import { appSessionLabel, isAppSession, type AccountSessionLabelFields } from '@agiworkforce/types';

export interface SessionDeviceFields extends AccountSessionLabelFields {
  device: string;
}

export function sessionDeviceLabel(row: SessionDeviceFields): string {
  return isAppSession(row) ? appSessionLabel(row) : row.device;
}
