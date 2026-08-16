#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredParts = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.expo',
  'ios',
  'android',
]);

const mobileRoot = 'apps/mobile';
const featureRoot = `${mobileRoot}/src/features`;

const allowedRootHooks = new Set(['useNetworkStatus.ts']);
const allowedRootLibModules = new Set([
  'abortSignal',
  'biometricFlagStore',
  'clipboard',
  'constants',
  'contentFilter',
  'deviceId',
  'dispatchAgentValidator',
  'dispatchHmac',
  'egressGuard',
  'markdown',
  'mmkv',
  'models',
  'pinning',
  'providerStreamClient',
  'safeOpenURL',
  'secureStorage',
  'sendQueue',
  'tagUtils',
  'v1FeatureFlags',
]);

const forbiddenMovedImports = [
  '@/hooks/useTheme',
  '@/hooks/useVoicePlayback',
  '@/lib/theme',
  '@/lib/voicePresets',
  '../hooks/useTheme',
  '../hooks/useVoicePlayback',
  '../lib/theme',
  '../lib/voicePresets',
];

const uiDirectIoBaseline = new Set([
  'apps/mobile/app/_layout.tsx',
  'apps/mobile/app/(auth)/reset-password.tsx',
  'apps/mobile/app/(app)/billing/index.tsx',
  'apps/mobile/app/(app)/usage.tsx',
  'apps/mobile/app/(app)/profile/index.tsx',
  'apps/mobile/app/(app)/companion/index.tsx',
  'apps/mobile/app/(app)/(tabs)/chat.tsx',
  'apps/mobile/app/(app)/chat/[id].tsx',
  'apps/mobile/src/features/feedback/index.tsx',
]);

const serviceStoreImportBaseline = new Set([
  'apps/mobile/lib/dispatchAgentValidator.ts',
  'apps/mobile/services/backgroundFetch.ts',
  'apps/mobile/services/cloudSyncEngine.ts',
  'apps/mobile/services/cloudSettingsMapping.ts',
  'apps/mobile/services/companion.ts',
  'apps/mobile/services/companionNotifications.ts',
  'apps/mobile/services/realtime.ts',
  'apps/mobile/services/notificationGate.ts',
]);

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function walk(relativeDir, files = []) {
  const absoluteDir = absolute(relativeDir);
  if (!fs.existsSync(absoluteDir)) return files;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      walk(relativePath, files);
      continue;
    }
    files.push(relativePath);
  }

  return files;
}

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]+?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function isKebabCase(value) {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

function isUiFile(relativePath) {
  if (!sourceExtensions.has(path.extname(relativePath))) return false;
  if (relativePath.startsWith('apps/mobile/app/')) return true;
  if (relativePath.startsWith('apps/mobile/src/shared/components/')) return true;
  if (relativePath.startsWith('apps/mobile/src/ui/')) return true;
  if (relativePath.startsWith('apps/mobile/components/ui/')) return true;
  if (/^apps\/mobile\/src\/features\/[^/]+\/index\.tsx$/.test(relativePath)) return true;
  return /^apps\/mobile\/src\/features\/[^/]+\/components\/.+\.tsx$/.test(relativePath);
}

function hasDirectIo(source) {
  const retiredDbClient = 'supa' + 'base';
  return (
    /\bfetch\s*\(/.test(source) ||
    /\bsecureFetch\s*\(/.test(source) ||
    new RegExp(`\\b${retiredDbClient}\\.`).test(source) ||
    /\bapi\./.test(source) ||
    new RegExp(`from\\s+['"]@/services/(?:api|${retiredDbClient}|secureFetch)['"]`).test(source) ||
    new RegExp(`from\\s+['"]@${retiredDbClient}/${retiredDbClient}-js['"]`).test(source)
  );
}

if (!exists(featureRoot)) {
  errors.push(`Missing Mobile feature root: ${featureRoot}`);
} else {
  for (const entry of fs.readdirSync(absolute(featureRoot), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const featureName = entry.name;
    const featureDir = `${featureRoot}/${featureName}`;
    if (!isKebabCase(featureName)) {
      errors.push(`Mobile feature directory must be kebab-case: ${featureDir}`);
    }
    if (!exists(`${featureDir}/index.ts`) && !exists(`${featureDir}/index.tsx`)) {
      errors.push(`Mobile feature directory must have index.ts or index.tsx: ${featureDir}`);
    }
  }
}

for (const file of walk(`${mobileRoot}/hooks`)) {
  const fileName = path.posix.basename(file);
  if (!allowedRootHooks.has(fileName)) {
    errors.push(
      `Mobile root hooks are frozen; move ${file} to src/features/<domain>/hooks or add an explicit hygiene exception.`,
    );
  }
}

for (const file of walk(mobileRoot)) {
  if (!sourceExtensions.has(path.extname(file))) continue;

  const body = readText(file);
  const specifiers = importSpecifiers(body);

  for (const forbiddenImport of forbiddenMovedImports) {
    if (specifiers.includes(forbiddenImport)) {
      errors.push(`${file} imports retired Mobile path ${forbiddenImport}`);
    }
  }

  for (const specifier of specifiers) {
    if (!specifier.startsWith('@/lib/')) continue;

    const moduleName = specifier.slice('@/lib/'.length).split('/')[0];
    if (!allowedRootLibModules.has(moduleName)) {
      errors.push(
        `${file} imports @/lib/${moduleName}; Mobile root lib is frozen, so move new utility ownership under src/features, src/platform, src/storage, or src/integrations.`,
      );
    }
  }

  if (isUiFile(file) && hasDirectIo(body) && !uiDirectIoBaseline.has(file)) {
    errors.push(
      `${file} performs direct network/auth/client I/O in a UI file; move mechanics into a feature service or src/integrations and keep UI orchestration-only.`,
    );
  }

  const scansServiceOrLib =
    file.startsWith('apps/mobile/services/') || file.startsWith('apps/mobile/lib/');
  const importsRootStore = specifiers.some(
    (specifier) => specifier.startsWith('@/stores/') || specifier === '@/stores',
  );
  if (scansServiceOrLib && importsRootStore && !serviceStoreImportBaseline.has(file)) {
    errors.push(
      `${file} imports root stores from service/lib code; keep service mechanics independent from Zustand stores or add an explicit migration baseline.`,
    );
  }
}

if (errors.length > 0) {
  console.error('Mobile hygiene check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Mobile hygiene check passed.');
