/* eslint-disable @typescript-eslint/no-require-imports */
import fs from 'fs';
import os from 'os';
import path from 'path';

const { IOSConfig } = require('expo/config-plugins') as {
  IOSConfig: { XcodeUtils: { getPbxproj: (projectRoot: string) => XcodeProject } };
};

interface XcodeProject {
  getFirstTarget: () => { uuid: string };
  pbxFileReferenceSection: () => Record<string, { path?: string } | string>;
  pbxBuildFileSection: () => Record<string, { fileRef?: string } | string>;
  pbxNativeTargetSection: () => Record<string, { name?: string } | string>;
  pbxSourcesBuildPhaseObj: (target: string) => { files: { value: string }[] } | null;
  writeSync: () => string;
}

const nativePlugin = require('../native/ios/withAGINativeModulesIOS.cjs') as {
  WIDGET_SHARED_INTENT_FILES: string[];
  appGroupKeyFor: (project: XcodeProject, appName: string) => string;
  ensureSourceInTargets: (
    project: XcodeProject,
    options: { projectPath: string; groupKey: string; targetUuids: string[] },
  ) => void;
};
const widgetPlugin = require('../native/ios/withAGIWidgets.cjs') as {
  configureWidgetTarget: (
    project: XcodeProject,
    options: { appName: string; bundleIdentifier: string; version: string; buildNumber: string },
  ) => void;
};

const nativeRoot = path.join(__dirname, '..', 'native', 'ios');
const readNative = (relPath: string) => fs.readFileSync(path.join(nativeRoot, relPath), 'utf8');
const INTENT_PROJECT_PATH = 'Mobile/AGIAppIntents/OpenAGIWorkforceIntent.swift';

const MINIMAL_PBXPROJ = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 54;
	objects = {

/* Begin PBXBuildFile section */
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		A0000000000000000000000B /* Mobile.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Mobile.app; sourceTree = BUILT_PRODUCTS_DIR; };
/* End PBXFileReference section */

/* Begin PBXGroup section */
		A0000000000000000000000C = {
			isa = PBXGroup;
			children = (
				A0000000000000000000000D /* Mobile */,
				A0000000000000000000000E /* Products */,
			);
			sourceTree = "<group>";
		};
		A0000000000000000000000D /* Mobile */ = {
			isa = PBXGroup;
			children = (
			);
			name = Mobile;
			sourceTree = "<group>";
		};
		A0000000000000000000000E /* Products */ = {
			isa = PBXGroup;
			children = (
				A0000000000000000000000B /* Mobile.app */,
			);
			name = Products;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		A0000000000000000000000F /* Mobile */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = A00000000000000000000010 /* Build configuration list for PBXNativeTarget "Mobile" */;
			buildPhases = (
				A00000000000000000000011 /* Sources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = Mobile;
			productName = Mobile;
			productReference = A0000000000000000000000B /* Mobile.app */;
			productType = "com.apple.product-type.application";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		A00000000000000000000012 /* Project object */ = {
			isa = PBXProject;
			attributes = {
				LastUpgradeCheck = 1130;
				TargetAttributes = {
					A0000000000000000000000F = {
						LastSwiftMigration = 1250;
					};
				};
			};
			buildConfigurationList = A00000000000000000000013 /* Build configuration list for PBXProject "Mobile" */;
			compatibilityVersion = "Xcode 3.2";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
			);
			mainGroup = A0000000000000000000000C;
			productRefGroup = A0000000000000000000000E /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				A0000000000000000000000F /* Mobile */,
			);
		};
/* End PBXProject section */

/* Begin PBXSourcesBuildPhase section */
		A00000000000000000000011 /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		A00000000000000000000014 /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				PRODUCT_NAME = Mobile;
			};
			name = Release;
		};
		A00000000000000000000015 /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
			};
			name = Release;
		};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		A00000000000000000000010 /* Build configuration list for PBXNativeTarget "Mobile" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				A00000000000000000000014 /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
		A00000000000000000000013 /* Build configuration list for PBXProject "Mobile" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				A00000000000000000000015 /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
/* End XCConfigurationList section */
	};
	rootObject = A00000000000000000000012 /* Project object */;
}
`;

function freshProject(): XcodeProject {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-widgets-plugin-'));
  const projectDir = path.join(projectRoot, 'ios', 'Mobile.xcodeproj');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'project.pbxproj'), MINIMAL_PBXPROJ);
  return IOSConfig.XcodeUtils.getPbxproj(projectRoot);
}

function runAppPlugin(project: XcodeProject) {
  nativePlugin.ensureSourceInTargets(project, {
    projectPath: INTENT_PROJECT_PATH,
    groupKey: nativePlugin.appGroupKeyFor(project, 'Mobile'),
    targetUuids: [project.getFirstTarget().uuid],
  });
}

function runWidgetPlugin(project: XcodeProject) {
  widgetPlugin.configureWidgetTarget(project, {
    appName: 'Mobile',
    bundleIdentifier: 'com.agiworkforce.app',
    version: '1.0.0',
    buildNumber: '1',
  });
}

function intentMembership(project: XcodeProject) {
  const objects = <T>(section: Record<string, T | string>) =>
    Object.entries(section).filter(
      (entry): entry is [string, T] =>
        !entry[0].endsWith('_comment') && typeof entry[1] === 'object',
    );
  const references = objects(project.pbxFileReferenceSection())
    .filter(([, reference]) => String(reference.path).replace(/"/g, '') === INTENT_PROJECT_PATH)
    .map(([uuid]) => uuid);
  const buildFiles = objects(project.pbxBuildFileSection())
    .filter(([, buildFile]) => references.includes(String(buildFile.fileRef)))
    .map(([uuid]) => uuid);
  const targets = objects(project.pbxNativeTargetSection())
    .filter(([uuid]) =>
      project.pbxSourcesBuildPhaseObj(uuid)?.files.some((file) => buildFiles.includes(file.value)),
    )
    .map(([, target]) => String(target.name).replace(/"/g, ''))
    .sort();
  return { references: references.length, buildFiles: buildFiles.length, targets };
}

describe('Control Center control intent', () => {
  it('has one definition, outside the widget source', () => {
    expect(readNative('AGIWidgets/AGIWidgets.swift')).not.toContain(
      'struct OpenAGIWorkforceIntent',
    );
    expect(readNative('AGIAppIntents/OpenAGIWorkforceIntent.swift')).toContain(
      'struct OpenAGIWorkforceIntent: AppIntent',
    );
    expect(readNative('AGIWidgets/AGIWidgets.swift')).toContain(
      'ControlWidgetButton(action: OpenAGIWorkforceIntent())',
    );
    expect(nativePlugin.WIDGET_SHARED_INTENT_FILES).toEqual([
      'AGIAppIntents/OpenAGIWorkforceIntent.swift',
    ]);
  });

  it.each([
    ['the widget plugin runs first', [runWidgetPlugin, runAppPlugin]],
    ['the app plugin runs first', [runAppPlugin, runWidgetPlugin]],
  ])('is a member of the app and widget targets when %s', (_, order) => {
    const project = freshProject();
    for (const run of [...order, ...order]) run(project);
    expect(intentMembership(project)).toEqual({
      references: 1,
      buildFiles: 2,
      targets: ['AGIWidgets', 'Mobile'],
    });
    expect(project.writeSync()).toContain('OpenAGIWorkforceIntent.swift in Sources');
  });
});

describe('Shortcuts file intents', () => {
  it.each([
    ['AnalyzeImageIntent.swift', 'AGIIntentFileStaging.stageImage(image)'],
    ['ScanIntent.swift', 'AGIIntentFileStaging.stageImage(image)'],
    ['TranscribeIntent.swift', 'AGIIntentFileStaging.stageAudio(audio)'],
  ])('%s hands the app its own staged copy, never the provider URL', (fileName, staging) => {
    const source = readNative(`AGIAppIntents/${fileName}`);
    expect(source).toContain(`try ${staging}.absoluteString`);
    expect(source).not.toContain('.fileURL');
  });

  it('reads the data when there is no file URL and fails with a visible error', () => {
    const dispatch = readNative('AGIAppIntents/AGIIntentDispatch.swift');
    expect(dispatch).toContain('if let url = file.fileURL');
    expect(dispatch).toContain('let data = file.data');
    expect(dispatch).toContain('CustomLocalizedStringResourceConvertible');
    expect(dispatch).toContain('throw AGIIntentFileError.unreadableImage');
    expect(dispatch).toContain('throw AGIIntentFileError.unreadableAudio');
    expect(dispatch).toContain('.cachesDirectory');
    expect(dispatch).toContain('UTType.jpeg.identifier');
  });
});

describe('native Shortcuts copy', () => {
  const intentSources = fs
    .readdirSync(path.join(nativeRoot, 'AGIAppIntents'))
    .map((fileName) => `AGIAppIntents/${fileName}`)
    .concat(['AGIWidgets/AGIWidgets.swift']);

  it.each(intentSources)('%s never promises where the AI runs', (relPath) => {
    expect(readNative(relPath)).not.toMatch(/on[- ]device|offline AI|locally/i);
  });

  it('tells a Siri user which switch to turn on instead of asking a signed-in person to sign in', () => {
    const ask = readNative('AGIAppIntents/AskAGIIntent.swift');
    expect(ask).not.toContain('Open AGI Mobile to sign in.');
    expect(ask).toContain('guard let token = storedToken() else { return switchedOffMessage }');
    expect(ask).toContain('if status == 401 { return tokenRejectedMessage }');
    expect(ask).toMatch(
      /switchedOffMessage =\s+"Ask from Siri is off\..*Settings, Security and login\."/,
    );
    expect(ask).toMatch(
      /tokenRejectedMessage =\s+"Ask from Siri needs to be set up again\..*Settings, Security and login\."/,
    );
    expect(ask).not.toContain('Account Security');
  });
});
