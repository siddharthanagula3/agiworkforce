/* global require, module */
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

function bootstrapOwnedNative(electron, environment, target, loadMain) {
  const { app, dialog, globalShortcut, shell } = electron;
  const fixtureProfile = environment.AGI_OWNED_PROFILE;
  if (environment.AGI_OWNED_BROWSER_ONLY === '1') {
    shell.openExternal = async (url) => {
      fs.appendFileSync(
        path.join(environment.AGI_OWNED_PROFILE, 'opened.jsonl'),
        `${JSON.stringify({ url })}\n`,
      );
    };
  }
  app.setPath('appData', fixtureProfile);
  app.setPath('userData', fixtureProfile);
  app.setPath('logs', path.join(fixtureProfile, 'logs'));
  app.setAsDefaultProtocolClient = () => false;
  app.setLoginItemSettings = () => {};
  globalShortcut.register = () => false;
  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [environment.AGI_OWNED_PROJECT],
  });
  dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  const originalFetch = target.fetch.bind(target);
  target.fetch = async (input, options) => {
    const parsed = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (parsed.origin !== environment.AGI_OWNED_ORIGIN || parsed.username || parsed.password) {
      throw new Error('External network is outside this owned fixture');
    }
    return originalFetch(input, options);
  };
  loadMain(environment.AGI_OWNED_MAIN);
  const userData = app.getPath('userData');
  const relative = path.relative(fixtureProfile, userData);
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error('Desktop resolved its profile outside the owned acceptance directory.');
  }
  const stagedSettings = path.join(fixtureProfile, 'settings.json');
  const activeSettings = path.join(userData, 'settings.json');
  if (fs.existsSync(stagedSettings) && !fs.existsSync(activeSettings)) {
    fs.mkdirSync(userData, { recursive: true });
    fs.copyFileSync(stagedSettings, activeSettings, fs.constants.COPYFILE_EXCL);
  }
}

module.exports = { bootstrapOwnedNative };
