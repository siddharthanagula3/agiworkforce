
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-detox-plugin';
const PLUGIN_VERSION = '1.0.0';
const DEFAULT_DOMAINS = ['10.0.2.2', 'localhost'];
const DETOX_VERSION = require('detox/package.json').version;

const DETOX_MAVEN_BLOCK = `// @generated begin agi-detox-maven - expo prebuild (DO NOT MODIFY)
def detoxMavenPath = new File(["node", "--print", "require.resolve('detox/package.json')"].execute(null, rootDir).text.trim(), "../Detox-android")
allprojects { repositories { maven { url(detoxMavenPath) } } }
// @generated end agi-detox-maven`;

const DETOX_DEFAULT_CONFIG = `        // agi-detox-default-config
        testBuildType System.getProperty('testBuildType', 'debug')
        testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'`;

const DETOX_DEPENDENCIES = [
  `androidTestImplementation('com.wix:detox:${DETOX_VERSION}')`,
  "implementation 'androidx.appcompat:appcompat:1.6.1'",
];

const DETOX_PROGUARD_BLOCK = `            // Detox rules are only consumed by release test builds.
            def detoxProguardRulesPath = new File(["node", "--print", "require.resolve('detox/package.json')"].execute(null, rootDir).text.trim(), "../android/detox/proguard-rules-app.pro")
            proguardFile(detoxProguardRulesPath)`;

function replaceRequiredAnchor(contents, pattern, replacement, label) {
  if (!pattern.test(contents)) {
    throw new Error(`Cannot configure Detox: ${label} was not found in the generated Gradle file`);
  }
  return contents.replace(pattern, replacement);
}

function patchProjectBuildGradle(contents) {
  if (contents.includes("require.resolve('detox/package.json')")) return contents;
  return `${contents.trimEnd()}\n${DETOX_MAVEN_BLOCK}\n`;
}

function patchAppBuildGradle(contents, { skipProguard = false } = {}) {
  let output = contents;

  if (!output.includes('agi-detox-default-config')) {
    output = replaceRequiredAnchor(
      output,
      /defaultConfig\s*\{/,
      `defaultConfig {\n${DETOX_DEFAULT_CONFIG}`,
      'defaultConfig',
    );
  }

  for (const dependency of DETOX_DEPENDENCIES) {
    if (output.includes(dependency)) continue;
    output = replaceRequiredAnchor(
      output,
      /dependencies\s*\{/,
      `dependencies {\n    ${dependency}`,
      'dependencies',
    );
  }

  if (!skipProguard && !output.includes('detox/proguard-rules-app.pro')) {
    const proguardLine =
      /proguardFiles getDefaultProguardFile\("proguard-android\.txt"\),\s*"proguard-rules\.pro"/;
    const match = output.match(proguardLine);
    if (!match) {
      throw new Error(
        'Cannot configure Detox: release proguardFiles was not found in the generated Gradle file',
      );
    }
    output = output.replace(proguardLine, `${match[0]}\n${DETOX_PROGUARD_BLOCK}`);
  }

  return output;
}

function validateAndroidPackage(androidPackage) {
  if (
    typeof androidPackage !== 'string' ||
    !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(androidPackage)
  ) {
    throw new Error('Cannot configure Detox: android.package must be a valid Java package name');
  }
  return androidPackage;
}

function createDetoxTestSource(androidPackage) {
  const packageName = validateAndroidPackage(androidPackage);
  return `package ${packageName};

import com.wix.detox.Detox;
import com.wix.detox.config.DetoxConfig;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.rule.ActivityTestRule;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class DetoxTest {
    @Rule
    public ActivityTestRule<MainActivity> mActivityRule = new ActivityTestRule<>(MainActivity.class, false, false);

    @Test
    public void runDetoxTests() {
        DetoxConfig detoxConfig = new DetoxConfig();
        detoxConfig.idlePolicyConfig.masterTimeoutSec = 90;
        detoxConfig.idlePolicyConfig.idleResourceTimeoutSec = 60;
        detoxConfig.rnContextLoadTimeoutSec = (${packageName}.BuildConfig.DEBUG ? 180 : 60);

        Detox.runTests(mActivityRule, detoxConfig);
    }
}
`;
}

function normalizeDomains(domains = DEFAULT_DOMAINS) {
  if (domains === '*') return domains;
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new Error('Cannot configure Detox: subdomains must be "*" or a non-empty array');
  }
  return domains.map((domain) => {
    if (typeof domain !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(domain)) {
      throw new Error(`Cannot configure Detox: invalid network-security domain ${String(domain)}`);
    }
    return domain;
  });
}

function createNetworkSecurityConfig(domains = DEFAULT_DOMAINS) {
  const normalized = normalizeDomains(domains);
  const policy =
    normalized === '*'
      ? '  <base-config cleartextTrafficPermitted="true" />'
      : `  <domain-config cleartextTrafficPermitted="true">\n${normalized
          .map((domain) => `    <domain includeSubdomains="true">${domain}</domain>`)
          .join('\n')}\n  </domain-config>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
${policy}
</network-security-config>
`;
}

function withDetoxProjectGradle(config) {
  return withProjectBuildGradle(config, (nextConfig) => {
    if (nextConfig.modResults.language !== 'groovy') {
      throw new Error('Cannot configure Detox: Android project build.gradle must use Groovy');
    }
    nextConfig.modResults.contents = patchProjectBuildGradle(nextConfig.modResults.contents);
    return nextConfig;
  });
}

function withDetoxAppGradle(config, options) {
  return withAppBuildGradle(config, (nextConfig) => {
    if (nextConfig.modResults.language !== 'groovy') {
      throw new Error('Cannot configure Detox: Android app build.gradle must use Groovy');
    }
    nextConfig.modResults.contents = patchAppBuildGradle(nextConfig.modResults.contents, options);
    return nextConfig;
  });
}

function withDetoxTestClass(config) {
  return withDangerousMod(config, [
    'android',
    async (nextConfig) => {
      const packageName = validateAndroidPackage(nextConfig.android?.package);
      const testDirectory = path.join(
        nextConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'androidTest',
        'java',
        ...packageName.split('.'),
      );
      fs.mkdirSync(testDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(testDirectory, 'DetoxTest.java'),
        createDetoxTestSource(packageName),
        'utf8',
      );
      return nextConfig;
    },
  ]);
}

function withDetoxNetworkSecurity(config, domains) {
  let nextConfig = withDangerousMod(config, [
    'android',
    async (dangerousConfig) => {
      const outputDirectory = path.join(
        dangerousConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(outputDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(outputDirectory, 'network_security_config.xml'),
        createNetworkSecurityConfig(domains),
        'utf8',
      );
      return dangerousConfig;
    },
  ]);

  nextConfig = withAndroidManifest(nextConfig, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifestConfig.modResults);
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return manifestConfig;
  });
  return nextConfig;
}

function withAGIDetox(config, { skipProguard = false, subdomains = DEFAULT_DOMAINS } = {}) {
  normalizeDomains(subdomains);
  let nextConfig = withDetoxProjectGradle(config);
  nextConfig = withDetoxAppGradle(nextConfig, { skipProguard });
  nextConfig = withDetoxTestClass(nextConfig);
  nextConfig = withDetoxNetworkSecurity(nextConfig, subdomains);
  return nextConfig;
}

const plugin = createRunOncePlugin(withAGIDetox, PLUGIN_NAME, PLUGIN_VERSION);
module.exports = plugin;
module.exports.createDetoxTestSource = createDetoxTestSource;
module.exports.createNetworkSecurityConfig = createNetworkSecurityConfig;
module.exports.patchAppBuildGradle = patchAppBuildGradle;
module.exports.patchProjectBuildGradle = patchProjectBuildGradle;
