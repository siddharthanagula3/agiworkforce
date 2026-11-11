const { IOSConfig } = require('expo/config-plugins');

// Expo prebuild names the generated workspace, scheme, target and .app after
// the app config `name`, passed through this same sanitizer.
function iosProjectNameFor(appName) {
  return IOSConfig.XcodeUtils.sanitizedName(appName);
}

function appIosProjectName() {
  return iosProjectNameFor(require('../../app.config.js').expo.name);
}

module.exports = { appIosProjectName, iosProjectNameFor };
