import { PRODUCT_NAMES } from '@agiworkforce/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js') as { expo: { name: string } };

describe('Mobile app smoke test', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('names the app as the product registry does', () => {
    expect(appConfig.expo.name).toBe(PRODUCT_NAMES.mobile);
  });
});
