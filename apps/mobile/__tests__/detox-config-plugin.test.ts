
/* eslint-disable @typescript-eslint/no-require-imports */

const {
  createDetoxTestSource,
  createNetworkSecurityConfig,
  patchAppBuildGradle,
  patchProjectBuildGradle,
} = require('../native/android/withAGIDetox.cjs') as {
  createDetoxTestSource: (androidPackage: string) => string;
  createNetworkSecurityConfig: (domains?: string[] | '*') => string;
  patchAppBuildGradle: (contents: string, options?: { skipProguard?: boolean }) => string;
  patchProjectBuildGradle: (contents: string) => string;
};

const PROJECT_GRADLE = `buildscript {
  repositories { google(); mavenCentral() }
}

allprojects {
  repositories { google(); mavenCentral() }
}
`;

const APP_GRADLE = `android {
    defaultConfig {
        applicationId 'com.agiworkforce.app'
    }
    buildTypes {
        release {
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`;

describe('withAGIDetox config transforms', () => {
  it('adds the Detox Maven repository once', () => {
    const once = patchProjectBuildGradle(PROJECT_GRADLE);
    expect(once).toContain("require.resolve('detox/package.json')");
    expect(once).toContain('Detox-android');
    expect(patchProjectBuildGradle(once)).toBe(once);
  });

  it('adds the Android runner, dependencies, and release Proguard rules once', () => {
    const once = patchAppBuildGradle(APP_GRADLE);
    expect(once).toContain("testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'");
    expect(once).toContain("androidTestImplementation('com.wix:detox:20.51.4')");
    expect(once).not.toContain('com.wix:detox:+');
    expect(once).toContain("implementation 'androidx.appcompat:appcompat:1.6.1'");
    expect(once).toContain('detox/proguard-rules-app.pro');
    expect(patchAppBuildGradle(once)).toBe(once);
  });

  it('can omit release Proguard wiring without omitting the test runner', () => {
    const output = patchAppBuildGradle(APP_GRADLE, { skipProguard: true });
    expect(output).toContain("androidTestImplementation('com.wix:detox:20.51.4')");
    expect(output).not.toContain('detox/proguard-rules-app.pro');
  });

  it('fails loudly when a generated Gradle template loses a required anchor', () => {
    expect(() => patchAppBuildGradle('android {}')).toThrow(/defaultConfig|dependencies/);
  });

  it('creates a package-scoped Android test class with bounded Detox timeouts', () => {
    const source = createDetoxTestSource('com.agiworkforce.app');
    expect(source).toContain('package com.agiworkforce.app;');
    expect(source).toContain('public class DetoxTest');
    expect(source).toContain('masterTimeoutSec = 90');
    expect(source).toContain('rnContextLoadTimeoutSec');
  });

  it('limits cleartext traffic to emulator loopback hosts by default', () => {
    const xml = createNetworkSecurityConfig();
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('10.0.2.2');
    expect(xml).toContain('localhost');
    expect(xml).not.toContain('<base-config cleartextTrafficPermitted="true"');
  });
});
