// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js') as { expo: { name: string } };

describe('Mobile app smoke test', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have correct app name', () => {
    expect(appConfig.expo.name).toBe('AGI Workforce');
  });
});
