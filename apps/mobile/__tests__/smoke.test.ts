describe('Mobile app smoke test', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have correct app name', () => {
    const appJson = require('../app.json');
    expect(appJson.expo.name).toBe('AGI Workforce');
  });
});
