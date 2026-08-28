#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const errors = [];
const warnings = [];

function gitLines(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    errors.push(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
    return [];
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const trackedFiles = gitLines(['ls-files']);
const trackedIgnoredFiles = new Set(gitLines(['ls-files', '-ci', '--exclude-standard']));

const knownGeneratedDebtPatterns = [];

const allowedTrackedIgnoredPatterns = [];

const allowedAssetPatterns = [
  /^apps\/desktop\/src-tauri\/app-icon\.png$/,
  /^apps\/desktop\/src-tauri\/icons\//,
  /^apps\/desktop\/e2e\/screenshots\/baseline\//,
  /^apps\/extension\/icons\//,
  /^apps\/extension-vscode\/media\//,
  /^apps\/mobile\/assets\//,
  /^apps\/web\/public\/(app-preview|apple-touch-icon|logo|logo-192|logo-512)\.png$/,
];

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

for (const file of trackedFiles) {
  const isTrackedIgnored = trackedIgnoredFiles.has(file);
  const isKnownDebt = matchesAny(file, knownGeneratedDebtPatterns);
  const isAllowedIgnored = matchesAny(file, allowedTrackedIgnoredPatterns);
  const isAllowedAsset = matchesAny(file, allowedAssetPatterns);
  const isRootImage = !file.includes('/') && /\.(png|jpe?g|gif|webp)$/i.test(file);
  const isRootScratchMarkdown =
    !file.includes('/') && /^(app-|claude-design-|final-|index-after-|r6-).+\.md$/i.test(file);

  if (isTrackedIgnored && !isKnownDebt && !isAllowedIgnored) {
    errors.push(`Tracked ignored file is not classified: ${file}`);
    continue;
  }

  if ((isRootImage || isRootScratchMarkdown) && !isKnownDebt) {
    errors.push(`Loose root generated/scratch artifact is not classified: ${file}`);
    continue;
  }

  if (/^\.playwright-mcp\//.test(file) && !isKnownDebt) {
    errors.push(`Transient Playwright MCP capture is not classified: ${file}`);
    continue;
  }

  if (/\.(dmg|zip|tar|tgz|gz)$/i.test(file) && !isKnownDebt && !isAllowedAsset) {
    errors.push(`Large generated/download artifact is not classified: ${file}`);
    continue;
  }

  if ((isTrackedIgnored || isKnownDebt) && !isAllowedIgnored) {
    warnings.push(`Known generated/local artifact debt: ${file}`);
  }
}

if (errors.length > 0) {
  console.error('Generated artifact check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    console.error('\nKnown generated artifact debt:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('Generated artifact check passed with known debt:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
} else {
  console.log('Generated artifact check passed.');
}
