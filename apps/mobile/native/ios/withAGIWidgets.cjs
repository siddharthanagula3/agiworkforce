const { withDangerousMod, withXcodeProject, createRunOncePlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const { ensureTargetDependency } = require('./withAGIShareExtension.cjs');

const PLUGIN_NAME = 'agi-widgets-ios-plugin';
const PLUGIN_VERSION = '1.0.0';
const EXTENSION_NAME = 'AGIWidgets';
const EXTENSION_SOURCE = 'AGIWidgets.swift';
const EXTENSION_INFO_PLIST = 'AGIWidgets-Info.plist';
const EXTENSION_ENTITLEMENTS = 'AGIWidgets.entitlements';
const BUNDLE_SUFFIX = 'widgets';
const DEFAULT_IOS_DEVELOPMENT_TEAM = 'D2PR62RLT4';
const IOS_DEPLOYMENT_TARGET = '17.0';
const NATIVE_EXTENSION_DIR = path.join(__dirname, EXTENSION_NAME);

function unquote(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
}

function developmentTeam() {
  return (
    process.env.AGI_IOS_DEVELOPMENT_TEAM ||
    process.env.EXPO_IOS_DEVELOPMENT_TEAM ||
    DEFAULT_IOS_DEVELOPMENT_TEAM
  ).trim();
}

function findNativeTarget(project) {
  for (const [uuid, target] of Object.entries(project.pbxNativeTargetSection())) {
    if (uuid.endsWith('_comment') || !target || typeof target !== 'object') continue;
    if (unquote(target.name) === EXTENSION_NAME) return { uuid, pbxNativeTarget: target };
  }
  return null;
}

function ensureBuildPhase(project, target, type, name) {
  const phases = target.pbxNativeTarget.buildPhases ?? [];
  if (phases.some((phase) => phase.comment === name)) return;
  project.addBuildPhase([], type, name, target.uuid);
}

function buildSettings({ bundleIdentifier, version, buildNumber }) {
  return {
    APPLICATION_EXTENSION_API_ONLY: 'YES',
    CODE_SIGN_STYLE: 'Automatic',
    CODE_SIGN_ENTITLEMENTS: `"${EXTENSION_NAME}/${EXTENSION_ENTITLEMENTS}"`,
    CURRENT_PROJECT_VERSION: `"${buildNumber}"`,
    DEVELOPMENT_TEAM: developmentTeam(),
    GENERATE_INFOPLIST_FILE: 'NO',
    INFOPLIST_FILE: `"${EXTENSION_NAME}/${EXTENSION_INFO_PLIST}"`,
    IPHONEOS_DEPLOYMENT_TARGET: IOS_DEPLOYMENT_TARGET,
    MARKETING_VERSION: `"${version}"`,
    PRODUCT_BUNDLE_IDENTIFIER: `"${bundleIdentifier}.${BUNDLE_SUFFIX}"`,
    PRODUCT_MODULE_NAME: `"${EXTENSION_NAME}"`,
    PRODUCT_NAME: `"${EXTENSION_NAME}"`,
    SKIP_INSTALL: 'YES',
    SUPPORTED_PLATFORMS: '"iphoneos iphonesimulator"',
    SWIFT_VERSION: '5.0',
    TARGETED_DEVICE_FAMILY: '"1,2"',
  };
}

function applyBuildSettings(project, target, settings) {
  const lists = project.pbxXCConfigurationList();
  const configurations = project.pbxXCBuildConfigurationSection();
  const list = lists[target.pbxNativeTarget.buildConfigurationList];
  if (!list?.buildConfigurations) {
    throw new Error(`${PLUGIN_NAME}: missing build configurations for ${EXTENSION_NAME}`);
  }
  for (const reference of list.buildConfigurations) {
    const configuration = configurations[reference.value];
    if (!configuration?.buildSettings) {
      throw new Error(`${PLUGIN_NAME}: missing Xcode build settings for ${reference.value}`);
    }
    Object.assign(configuration.buildSettings, settings);
  }
}

function ensureGroup(project) {
  const existing =
    project.findPBXGroupKey({ name: EXTENSION_NAME }) ||
    project.findPBXGroupKey({ path: EXTENSION_NAME });
  if (existing) return existing;
  const group = project.addPbxGroup([], EXTENSION_NAME, EXTENSION_NAME);
  const mainGroup = project.getFirstProject()?.firstProject?.mainGroup;
  if (!mainGroup) throw new Error(`${PLUGIN_NAME}: could not locate the main group`);
  project.addToPbxGroup(group.uuid, mainGroup);
  return group.uuid;
}

function hasFileReference(project, fileName) {
  return Object.values(project.pbxFileReferenceSection()).some(
    (reference) =>
      reference && typeof reference === 'object' && unquote(reference.path) === fileName,
  );
}

function configureWidgetTarget(project, options) {
  const hostTarget = project.getFirstTarget();
  let target = findNativeTarget(project);
  if (!target) {
    const objects = project.hash.project.objects;
    objects.PBXContainerItemProxy ??= {};
    objects.PBXTargetDependency ??= {};
    target = project.addTarget(
      EXTENSION_NAME,
      'app_extension',
      EXTENSION_NAME,
      `${options.bundleIdentifier}.${BUNDLE_SUFFIX}`,
    );
  }
  ensureTargetDependency(project, hostTarget, target);
  ensureBuildPhase(project, target, 'PBXSourcesBuildPhase', 'Sources');
  ensureBuildPhase(project, target, 'PBXFrameworksBuildPhase', 'Frameworks');
  ensureBuildPhase(project, target, 'PBXResourcesBuildPhase', 'Resources');
  const groupKey = ensureGroup(project);
  if (!hasFileReference(project, EXTENSION_SOURCE)) {
    project.addSourceFile(EXTENSION_SOURCE, { target: target.uuid }, groupKey);
  }
  for (const fileName of [EXTENSION_INFO_PLIST, EXTENSION_ENTITLEMENTS]) {
    if (!hasFileReference(project, fileName)) project.addFile(fileName, groupKey);
  }
  applyBuildSettings(project, target, buildSettings(options));
  project.addTargetAttribute('ProvisioningStyle', 'Automatic', target);
  return target;
}

function withCopyWidgetSources(config) {
  return withDangerousMod(config, [
    'ios',
    async (c) => {
      const destination = path.join(c.modRequest.projectRoot, 'ios', EXTENSION_NAME);
      fs.mkdirSync(destination, { recursive: true });
      for (const fileName of [EXTENSION_SOURCE, EXTENSION_INFO_PLIST, EXTENSION_ENTITLEMENTS]) {
        const source = path.join(NATIVE_EXTENSION_DIR, fileName);
        if (!fs.existsSync(source)) {
          throw new Error(`${PLUGIN_NAME}: required source is missing at ${source}`);
        }
        fs.copyFileSync(source, path.join(destination, fileName));
      }
      return c;
    },
  ]);
}

function withWidgetXcodeTarget(config) {
  return withXcodeProject(config, (c) => {
    const bundleIdentifier = c.ios?.bundleIdentifier;
    const version = c.version;
    const buildNumber = c.ios?.buildNumber;
    if (!bundleIdentifier || !version || !buildNumber) {
      throw new Error(`${PLUGIN_NAME}: bundleIdentifier, version and buildNumber are required`);
    }
    configureWidgetTarget(c.modResults, { bundleIdentifier, version, buildNumber });
    return c;
  });
}

function withAGIWidgets(config) {
  return withWidgetXcodeTarget(withCopyWidgetSources(config));
}

module.exports = createRunOncePlugin(withAGIWidgets, PLUGIN_NAME, PLUGIN_VERSION);
module.exports.configureWidgetTarget = configureWidgetTarget;
