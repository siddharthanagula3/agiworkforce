
const { withDangerousMod, withXcodeProject, createRunOncePlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-share-extension-ios-plugin';
const PLUGIN_VERSION = '1.0.0';
const EXTENSION_NAME = 'AGIShareExtension';
const EXTENSION_FOLDER = EXTENSION_NAME;
const EXTENSION_SOURCE = 'ShareViewController.swift';
const EXTENSION_INFO_PLIST = 'AGIShareExtension-Info.plist';
const EXTENSION_ENTITLEMENTS = 'AGIShareExtension.entitlements';
const APP_GROUP_IDENTIFIER = 'group.com.agiworkforce.app.share';
const DEFAULT_IOS_DEVELOPMENT_TEAM = 'D2PR62RLT4';
const IOS_DEPLOYMENT_TARGET = '17.0';
const NATIVE_EXTENSION_DIR = path.join(__dirname, EXTENSION_FOLDER);

function unquote(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
}

function getIosDevelopmentTeam() {
  return (
    process.env.AGI_IOS_DEVELOPMENT_TEAM ||
    process.env.EXPO_IOS_DEVELOPMENT_TEAM ||
    DEFAULT_IOS_DEVELOPMENT_TEAM
  ).trim();
}

function findNativeTarget(project, name) {
  const targets = project.pbxNativeTargetSection();
  for (const [uuid, target] of Object.entries(targets)) {
    if (uuid.endsWith('_comment') || !target || typeof target !== 'object') continue;
    if (unquote(target.name) === name) return { uuid, pbxNativeTarget: target };
  }
  return null;
}

function ensureBuildPhase(project, target, type, name) {
  const phases = target.pbxNativeTarget.buildPhases ?? [];
  if (phases.some((phase) => phase.comment === name)) return;
  project.addBuildPhase([], type, name, target.uuid);
}

function getExtensionBuildSettings({ bundleIdentifier, version, buildNumber, developmentTeam }) {
  return {
    APPLICATION_EXTENSION_API_ONLY: 'YES',
    CODE_SIGN_STYLE: 'Automatic',
    CODE_SIGN_ENTITLEMENTS: `"${EXTENSION_FOLDER}/${EXTENSION_ENTITLEMENTS}"`,
    CURRENT_PROJECT_VERSION: `"${buildNumber}"`,
    DEVELOPMENT_TEAM: developmentTeam,
    GENERATE_INFOPLIST_FILE: 'NO',
    INFOPLIST_FILE: `"${EXTENSION_FOLDER}/${EXTENSION_INFO_PLIST}"`,
    IPHONEOS_DEPLOYMENT_TARGET: IOS_DEPLOYMENT_TARGET,
    MARKETING_VERSION: `"${version}"`,
    PRODUCT_BUNDLE_IDENTIFIER: `"${bundleIdentifier}.share-extension"`,
    PRODUCT_MODULE_NAME: `"${EXTENSION_NAME}"`,
    PRODUCT_NAME: `"${EXTENSION_NAME}"`,
    SKIP_INSTALL: 'YES',
    SUPPORTED_PLATFORMS: '"iphoneos iphonesimulator"',
    SWIFT_VERSION: '5.0',
    TARGETED_DEVICE_FAMILY: '"1,2"',
  };
}

function applyTargetBuildSettings(project, target, settings) {
  const configurationLists = project.pbxXCConfigurationList();
  const configurations = project.pbxXCBuildConfigurationSection();
  const list = configurationLists[target.pbxNativeTarget.buildConfigurationList];
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

function ensureExtensionGroup(project) {
  const existing =
    project.findPBXGroupKey({ name: EXTENSION_NAME }) ||
    project.findPBXGroupKey({ path: EXTENSION_FOLDER });
  if (existing) return existing;

  const group = project.addPbxGroup([], EXTENSION_NAME, EXTENSION_FOLDER);
  const mainGroup = project.getFirstProject()?.firstProject?.mainGroup;
  if (!mainGroup) {
    throw new Error(`${PLUGIN_NAME}: could not locate the Xcode project's main group`);
  }
  project.addToPbxGroup(group.uuid, mainGroup);
  return group.uuid;
}

function ensureFileReference(project, groupKey, fileName) {
  const references = project.pbxFileReferenceSection();
  const exists = Object.values(references).some(
    (reference) =>
      reference && typeof reference === 'object' && unquote(reference.path) === fileName,
  );
  if (!exists) project.addFile(fileName, groupKey);
}

function ensureSourceFile(project, target, groupKey) {
  const references = project.pbxFileReferenceSection();
  const exists = Object.values(references).some(
    (reference) =>
      reference && typeof reference === 'object' && unquote(reference.path) === EXTENSION_SOURCE,
  );
  if (!exists) {
    project.addSourceFile(EXTENSION_SOURCE, { target: target.uuid }, groupKey);
  }
}

function ensureTargetDependency(project, hostTarget, extensionTarget) {
  const objects = project.hash.project.objects;
  objects.PBXContainerItemProxy ??= {};
  objects.PBXTargetDependency ??= {};

  const hostNativeTarget = hostTarget.pbxNativeTarget ?? hostTarget.firstTarget;
  if (!hostNativeTarget) {
    throw new Error(`${PLUGIN_NAME}: could not resolve the host app target`);
  }
  const dependencies = hostNativeTarget.dependencies ?? [];
  hostNativeTarget.dependencies = dependencies;
  const alreadyDependsOnExtension = dependencies.some((reference) => {
    const dependency = objects.PBXTargetDependency[reference.value];
    return dependency?.target === extensionTarget.uuid;
  });

  if (!alreadyDependsOnExtension) {
    project.addTargetDependency(hostTarget.uuid, [extensionTarget.uuid]);
  }
}

function configureShareExtensionTarget(project, options) {
  const bundleIdentifier = options.bundleIdentifier;
  const extensionBundleIdentifier = `${bundleIdentifier}.share-extension`;
  const hostTarget = project.getFirstTarget();
  let target = findNativeTarget(project, EXTENSION_NAME);
  if (!target) {
    const objects = project.hash.project.objects;
    objects.PBXContainerItemProxy ??= {};
    objects.PBXTargetDependency ??= {};
    target = project.addTarget(
      EXTENSION_NAME,
      'app_extension',
      EXTENSION_FOLDER,
      extensionBundleIdentifier,
    );
  }
  ensureTargetDependency(project, hostTarget, target);

  ensureBuildPhase(project, target, 'PBXSourcesBuildPhase', 'Sources');
  ensureBuildPhase(project, target, 'PBXFrameworksBuildPhase', 'Frameworks');
  ensureBuildPhase(project, target, 'PBXResourcesBuildPhase', 'Resources');

  const groupKey = ensureExtensionGroup(project);
  ensureSourceFile(project, target, groupKey);
  ensureFileReference(project, groupKey, EXTENSION_INFO_PLIST);
  ensureFileReference(project, groupKey, EXTENSION_ENTITLEMENTS);
  applyTargetBuildSettings(project, target, getExtensionBuildSettings(options));
  project.addTargetAttribute('ProvisioningStyle', 'Automatic', target);
  return target;
}

function withCopyShareExtensionSources(config) {
  return withDangerousMod(config, [
    'ios',
    async (c) => {
      const destination = path.join(c.modRequest.projectRoot, 'ios', EXTENSION_FOLDER);
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

function withShareExtensionXcodeTarget(config) {
  return withXcodeProject(config, (c) => {
    const bundleIdentifier = c.ios?.bundleIdentifier;
    if (!bundleIdentifier) {
      throw new Error(`${PLUGIN_NAME}: expo.ios.bundleIdentifier is required`);
    }
    configureShareExtensionTarget(c.modResults, {
      bundleIdentifier,
      version: c.version ?? '1.0.0',
      buildNumber: c.ios?.buildNumber ?? '1',
      developmentTeam: getIosDevelopmentTeam(),
    });
    return c;
  });
}

function withAGIShareExtension(config) {
  config = withCopyShareExtensionSources(config);
  config = withShareExtensionXcodeTarget(config);
  return config;
}

module.exports = createRunOncePlugin(withAGIShareExtension, PLUGIN_NAME, PLUGIN_VERSION);
module.exports.configureShareExtensionTarget = configureShareExtensionTarget;
module.exports.ensureTargetDependency = ensureTargetDependency;
module.exports.getExtensionBuildSettings = getExtensionBuildSettings;
module.exports.constants = {
  EXTENSION_NAME,
  EXTENSION_SOURCE,
  EXTENSION_INFO_PLIST,
  EXTENSION_ENTITLEMENTS,
  APP_GROUP_IDENTIFIER,
  IOS_DEPLOYMENT_TARGET,
};
