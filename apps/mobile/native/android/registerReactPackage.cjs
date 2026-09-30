const PACKAGE_LIST_BLOCKS = [
  /(PackageList\(this\)\.packages\.apply\s*\{)/,
  /(getPackages\(\)[^{]*\{[^}]*apply\s*\{)/s,
];

function registerReactPackage(mainApp, registration, pluginName) {
  if (mainApp.includes(registration)) return mainApp;
  for (const block of PACKAGE_LIST_BLOCKS) {
    const registered = mainApp.replace(block, `$1\n          ${registration}`);
    if (registered !== mainApp) return registered;
  }
  throw new Error(
    `${pluginName}: could not find the PackageList(this).packages.apply or getPackages() apply block in MainApplication.kt`,
  );
}

module.exports = { registerReactPackage };
