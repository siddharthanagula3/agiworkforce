import { app } from 'electron';
import { COMPANY_SITE_NAME, PRODUCT_NAMES } from '@agiworkforce/types';

export function aboutPanelOptions(
  version: string,
  year: number,
): Electron.AboutPanelOptionsOptions {
  return {
    applicationName: PRODUCT_NAMES.desktop,
    applicationVersion: version,
    copyright: `Copyright © ${year} ${COMPANY_SITE_NAME}`,
  };
}

export function installAboutPanel(): void {
  app.setAboutPanelOptions(aboutPanelOptions(app.getVersion(), new Date().getFullYear()));
}
