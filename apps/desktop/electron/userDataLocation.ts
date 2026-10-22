import path from 'node:path';
import { PRODUCT_NAMES } from '@agiworkforce/types';

/**
 * The folder this app has always kept its data in, named after the app's
 * earlier name. Renaming it would leave every existing install's settings,
 * sessions, pairing and browser host behind, so it stays fixed.
 */
export const USER_DATA_FOLDER = 'AGI Cloud';

interface NamedApp {
  getPath(name: 'appData'): string;
  setPath(name: 'userData', value: string): void;
  setName(name: string): void;
}

/** Runs before the single-instance lock, which lives in the data folder. */
export function settleAppIdentity(app: NamedApp): void {
  app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_FOLDER));
  app.setName(PRODUCT_NAMES.desktop);
}
