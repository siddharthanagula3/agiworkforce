/**
 * Contract tests for the tracked iOS Share Extension inputs. The generated
 * ios/ project is gitignored; these files and the config plugin are the only
 * durable source of the target across clean prebuild/EAS builds.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import fs from 'fs';
import path from 'path';

const plist = require('plist') as { parse: (value: string) => Record<string, unknown> };
const plugin = require('../native/ios/withAGIShareExtension.cjs') as {
  ensureTargetDependency: (
    project: {
      hash: { project: { objects: Record<string, Record<string, unknown>> } };
      addTargetDependency: jest.Mock;
    },
    hostTarget: { uuid: string; firstTarget: { dependencies: { value: string }[] } },
    extensionTarget: { uuid: string },
  ) => void;
  getExtensionBuildSettings: (options: {
    bundleIdentifier: string;
    version: string;
    buildNumber: string;
    developmentTeam: string;
  }) => Record<string, string>;
  constants: {
    EXTENSION_NAME: string;
    EXTENSION_SOURCE: string;
    EXTENSION_INFO_PLIST: string;
    EXTENSION_ENTITLEMENTS: string;
    APP_GROUP_IDENTIFIER: string;
    IOS_DEPLOYMENT_TARGET: string;
  };
};
const appConfig = require('../app.config.js') as {
  expo: {
    plugins: unknown[];
    ios?: { entitlements?: Record<string, unknown> };
  };
};

const extensionDirectory = path.join(__dirname, '..', 'native', 'ios', 'AGIShareExtension');
const source = fs.readFileSync(path.join(extensionDirectory, 'ShareViewController.swift'), 'utf8');
const hostInboxSource = fs.readFileSync(
  path.join(__dirname, '..', 'native', 'ios', 'AGIShareInbox.swift'),
  'utf8',
);
const hostInboxBridge = fs.readFileSync(
  path.join(__dirname, '..', 'native', 'ios', 'AGIShareInbox.m'),
  'utf8',
);
const nativeModulesPluginSource = fs.readFileSync(
  path.join(__dirname, '..', 'native', 'ios', 'withAGINativeModulesIOS.cjs'),
  'utf8',
);
const infoPlist = plist.parse(
  fs.readFileSync(path.join(extensionDirectory, 'AGIShareExtension-Info.plist'), 'utf8'),
) as {
  NSExtension?: {
    NSExtensionPointIdentifier?: string;
    NSExtensionPrincipalClass?: string;
    NSExtensionAttributes?: { NSExtensionActivationRule?: Record<string, unknown> };
  };
};
const extensionEntitlements = plist.parse(
  fs.readFileSync(path.join(extensionDirectory, 'AGIShareExtension.entitlements'), 'utf8'),
) as Record<string, unknown>;

describe('iOS Share Extension contract', () => {
  it('is registered in the authoritative Expo plugin list', () => {
    expect(appConfig.expo.plugins).toContain('./native/ios/withAGIShareExtension.cjs');
  });

  it('advertises only text and one web URL through the Apple share-services point', () => {
    expect(infoPlist.NSExtension?.NSExtensionPointIdentifier).toBe('com.apple.share-services');
    expect(infoPlist.NSExtension?.NSExtensionPrincipalClass).toBe(
      '$(PRODUCT_MODULE_NAME).ShareViewController',
    );
    expect(infoPlist.NSExtension?.NSExtensionAttributes?.NSExtensionActivationRule).toEqual({
      NSExtensionActivationSupportsText: true,
      NSExtensionActivationSupportsWebURLWithMaxCount: 1,
    });
  });

  it('pins an independently signed app-extension target with the app version/build', () => {
    const settings = plugin.getExtensionBuildSettings({
      bundleIdentifier: 'com.agiworkforce.app',
      version: '1.2.0',
      buildNumber: '42',
      developmentTeam: 'D2PR62RLT4',
    });
    expect(settings).toMatchObject({
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      CODE_SIGN_STYLE: 'Automatic',
      CODE_SIGN_ENTITLEMENTS: '"AGIShareExtension/AGIShareExtension.entitlements"',
      CURRENT_PROJECT_VERSION: '"42"',
      DEVELOPMENT_TEAM: 'D2PR62RLT4',
      INFOPLIST_FILE: '"AGIShareExtension/AGIShareExtension-Info.plist"',
      IPHONEOS_DEPLOYMENT_TARGET: '17.0',
      MARKETING_VERSION: '"1.2.0"',
      PRODUCT_BUNDLE_IDENTIFIER: '"com.agiworkforce.app.share-extension"',
      SKIP_INSTALL: 'YES',
    });
  });

  it('adds the host dependency once even when the optional Xcode sections start absent', () => {
    const objects: Record<string, Record<string, unknown>> = {};
    const addTargetDependency = jest.fn((hostUuid: string, extensionUuids: string[]) => {
      objects.PBXTargetDependency.DEPENDENCY = { target: extensionUuids[0] };
      hostTarget.firstTarget.dependencies.push({ value: 'DEPENDENCY' });
    });
    const project = { hash: { project: { objects } }, addTargetDependency };
    const hostTarget = {
      uuid: 'HOST',
      firstTarget: { dependencies: [] as { value: string }[] },
    };
    const extensionTarget = { uuid: 'EXTENSION' };

    plugin.ensureTargetDependency(project, hostTarget, extensionTarget);
    plugin.ensureTargetDependency(project, hostTarget, extensionTarget);

    expect(objects.PBXContainerItemProxy).toEqual({});
    expect(addTargetDependency).toHaveBeenCalledTimes(1);
    expect(addTargetDependency).toHaveBeenCalledWith('HOST', ['EXTENSION']);
  });

  it('uses the same App Group entitlement in the containing app and extension', () => {
    const expected = ['group.com.agiworkforce.app.share'];
    expect(appConfig.expo.ios?.entitlements?.['com.apple.security.application-groups']).toEqual(
      expected,
    );
    expect(extensionEntitlements['com.apple.security.application-groups']).toEqual(expected);
    expect(plugin.constants.APP_GROUP_IDENTIFIER).toBe(expected[0]);
  });

  it('previews and persists bounded text without trying to launch the containing app', () => {
    expect(source).toContain('Share with AGI');
    expect(source).toContain('Save for AGI Review');
    expect(source).toContain('maximumSharedBytes = 100 * 1024');
    expect(source).toContain('UTType.plainText.identifier');
    expect(source).toContain('UTType.url.identifier');
    expect(source).toContain('forSecurityApplicationGroupIdentifier: appGroupIdentifier');
    expect(source).toContain('data.write(to: destination, options: [.atomic])');
    expect(source).toContain('extensionContext?.completeRequest(returningItems: nil)');
    expect(source).not.toContain('extensionContext?.open');
    expect(source).not.toContain('UIApplication.shared');
  });

  it('wires a main-app native inbox consumer for the second review', () => {
    expect(nativeModulesPluginSource).toContain("'AGIShareInbox.m'");
    expect(nativeModulesPluginSource).toContain("'AGIShareInbox.swift'");
    expect(hostInboxBridge).toContain('RCT_EXTERN_MODULE(AGIShareInbox, NSObject)');
    expect(hostInboxSource).toContain('consumePendingShares');
    expect(hostInboxSource).toContain('forSecurityApplicationGroupIdentifier: appGroupIdentifier');
    expect(hostInboxSource).toContain('maximumSharedBytes = 100 * 1024');
  });

  it('keeps the plugin filenames aligned with the tracked native sources', () => {
    expect(plugin.constants).toEqual({
      EXTENSION_NAME: 'AGIShareExtension',
      EXTENSION_SOURCE: 'ShareViewController.swift',
      EXTENSION_INFO_PLIST: 'AGIShareExtension-Info.plist',
      EXTENSION_ENTITLEMENTS: 'AGIShareExtension.entitlements',
      APP_GROUP_IDENTIFIER: 'group.com.agiworkforce.app.share',
      IOS_DEPLOYMENT_TARGET: '17.0',
    });
  });
});
