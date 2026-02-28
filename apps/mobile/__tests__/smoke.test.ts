describe('Mobile app smoke test', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have correct app name', () => {
    // Use require instead of dynamic import to avoid --experimental-vm-modules requirement
    const appJson = require('../app.json');
    expect(appJson.expo.name).toBe('AGI Workforce');
  });
});
