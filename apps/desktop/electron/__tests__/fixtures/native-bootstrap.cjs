/* global require, module */
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

function bootstrapOwnedNative(electron, environment, target, loadMain) {
  const { app, dialog, globalShortcut, shell } = electron;
  if (environment.AGI_OWNED_BROWSER_ONLY === '1') {
    shell.openExternal = async (url) => {
      fs.appendFileSync(
        path.join(environment.AGI_OWNED_PROFILE, 'opened.jsonl'),
        `${JSON.stringify({ url })}\n`,
      );
    };
  }
  app.setPath('userData', environment.AGI_OWNED_PROFILE);
  app.setPath('logs', path.join(environment.AGI_OWNED_PROFILE, 'logs'));
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
}

module.exports = { bootstrapOwnedNative };
