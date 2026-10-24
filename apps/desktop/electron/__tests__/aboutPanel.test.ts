import { describe, expect, it, vi } from 'vitest';
import { COMPANY_SITE_NAME, PRODUCT_NAMES } from '@agiworkforce/types';

const setAboutPanelOptions = vi.fn();

vi.mock('electron', () => ({
  app: { setAboutPanelOptions, getVersion: () => '1.4.2' },
}));

const { aboutPanelOptions, installAboutPanel } = await import('../aboutPanel');

describe('the About panel', () => {
  it('names the product and the company from the registry', () => {
    expect(aboutPanelOptions('1.4.2', 2026)).toEqual({
      applicationName: PRODUCT_NAMES.desktop,
      applicationVersion: '1.4.2',
      copyright: `Copyright © 2026 ${COMPANY_SITE_NAME}`,
    });
  });

  it('hands the running version and the current year to the system panel', () => {
    installAboutPanel();

    expect(setAboutPanelOptions).toHaveBeenCalledWith(
      aboutPanelOptions('1.4.2', new Date().getFullYear()),
    );
  });
});
