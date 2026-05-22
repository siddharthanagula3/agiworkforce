// Expo config plugin: strips production-only iOS entitlements from local
// development prebuilds so personal/basic development provisioning profiles can
// install Debug builds on a physical iPhone.

const { withEntitlementsPlist, createRunOncePlugin } = require('@expo/config-plugins');

const PLUGIN_NAME = 'agi-dev-entitlements-ios-plugin';
const PLUGIN_VERSION = '1.0.0';

function envIsTruthy(name) {
  const value = process.env[name]?.toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function shouldUseProductionEntitlements() {
  const appEnv = process.env.APP_ENV || process.env.EXPO_PUBLIC_APP_ENV || 'development';
  return (
    envIsTruthy('EXPO_ENABLE_PRODUCTION_IOS_ENTITLEMENTS') ||
    (appEnv !== 'development' && !envIsTruthy('EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS'))
  );
}

function withAGIDevEntitlements(config) {
  if (shouldUseProductionEntitlements()) {
    return config;
  }

  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    delete c.modResults['com.apple.developer.applesignin'];
    delete c.modResults['com.apple.developer.associated-domains'];
    delete c.modResults['com.apple.developer.siri'];
    delete c.modResults['com.apple.developer.natural-language.translation'];
    return c;
  });
}

module.exports = createRunOncePlugin(withAGIDevEntitlements, PLUGIN_NAME, PLUGIN_VERSION);
