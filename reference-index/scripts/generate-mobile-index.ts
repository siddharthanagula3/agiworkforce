/* eslint-disable no-console -- CLI indexer tool; stdout progress is the intended output */
/**
 * reference-index/scripts/generate-mobile-index.ts
 *
 * Scans apps/mobile/ and emits:
 *   - reference-index/mobile-code-index.json
 *   - reference-index/mobile-ownership.json
 *
 * Excludes node_modules, .expo, android, ios, __tests__, __mocks__.
 * Ownership map sourced from ~/.claude/plans/here-is-the-approved-ancient-clover.md
 * (lines 596-766 of that doc, frozen here as a static table).
 *
 * Run from repo root:  pnpm tsx reference-index/scripts/generate-mobile-index.ts
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, basename } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');
const MOBILE_ROOT = join(REPO_ROOT, 'apps', 'mobile');
const OUTPUT_INDEX = join(REPO_ROOT, 'reference-index', 'mobile-code-index.json');
const OUTPUT_OWN = join(REPO_ROOT, 'reference-index', 'mobile-ownership.json');

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.expo',
  'android',
  'ios',
  '__tests__',
  '__mocks__',
  'dist',
  'build',
  '.next',
]);

const FILE_EXT = /\.(tsx?|jsx?)$/;

type LayerGuess =
  | 'entry'
  | 'core'
  | 'features'
  | 'platform'
  | 'integrations'
  | 'storage'
  | 'ui'
  | 'app'
  | 'unclassified';

interface FileRecord {
  path: string; // relative to repo root
  current_dir: string; // first segment under apps/mobile/
  proposed_dir: LayerGuess;
  role_guess: string;
  imports_in_count: number;
  imports_out_count: number;
  owner_role: string;
}

/** Static owner map derived from the file-ownership map plan.
 *  Patterns are checked top-to-bottom; first match wins.
 *  Each entry: { match: regex on relative-path-under-apps/mobile, owner }
 */
const OWNER_RULES: Array<{ match: RegExp; owner: string }> = [
  // Expo routes — most owned by TL or specific engineers
  { match: /^app\/_layout\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/_layout\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/\+error\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/\(tabs\)\/_layout\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/\(tabs\)\/chat\.tsx$/, owner: 'chat-screen-engineer' },
  { match: /^app\/\(app\)\/\(tabs\)\/settings\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/\(tabs\)\/index\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/\(tabs\)\/agents\.tsx$/, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/\(tabs\)\/projects\.tsx$/, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/chat\//, owner: 'chat-screen-engineer' },
  { match: /^app\/\(app\)\/settings\/index\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/settings\/personalization\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/settings\/memory\.tsx$/, owner: 'memory-engineer' },
  { match: /^app\/\(app\)\/settings\/storage\.tsx$/, owner: 'storage-engineer' },
  { match: /^app\/\(app\)\/settings\/notifications\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/settings\/auto-approve\.tsx$/, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/settings\/capabilities\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/settings\/integrations\.tsx$/, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/settings\/performance\.tsx$/, owner: 'performance-engineer' },
  { match: /^app\/\(app\)\/billing\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/account\.tsx$/, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/models\.tsx$/, owner: 'model-catalog-engineer' },
  { match: /^app\/\(app\)\/compare\.tsx$/, owner: 'compare-engineer' },
  { match: /^app\/\(app\)\/camera\.tsx$/, owner: 'vision-engineer' },
  { match: /^app\/\(app\)\/scan\.tsx$/, owner: 'vision-engineer' },
  { match: /^app\/\(app\)\/translate\.tsx$/, owner: 'translate-engineer' },
  { match: /^app\/\(app\)\/about\.tsx$/, owner: 'marketing-engineer' },
  { match: /^app\/\(app\)\/feedback\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/share-preview\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/widget-setup\.tsx$/, owner: 'TL' },
  { match: /^app\/\(app\)\/usage\.tsx$/, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/notifications\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/dispatch\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/companion\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/messaging\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/connectors\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/skills\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/agents\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/schedules\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(app\)\/profile\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(auth\)\//, owner: 'cloud-mode-gate' },
  { match: /^app\/\(public\)\//, owner: 'onboarding-engineer' },
  { match: /^app\/legal\//, owner: 'compliance-engineer' },
  { match: /^app\/\+error\.tsx$/, owner: 'TL' },
  { match: /^app\/\+not-found\.tsx$/, owner: 'TL' },
  // Components
  { match: /^components\/chat\/ModeToggle\.tsx$/, owner: 'chat-screen-engineer' },
  { match: /^components\/chat\/PerformanceChip\.tsx$/, owner: 'performance-engineer' },
  { match: /^components\/chat\/ModeSwitchModal\.tsx$/, owner: 'chat-screen-engineer' },
  { match: /^components\/chat\//, owner: 'chat-screen-engineer' },
  { match: /^components\/[Cc]omposer\//, owner: 'chat-screen-engineer' },
  { match: /^components\/voice\//, owner: 'voice-engineer' },
  { match: /^components\/onboarding\//, owner: 'onboarding-engineer' },
  { match: /^components\/waitlist\//, owner: 'waitlist-engineer' },
  { match: /^components\/model-picker\//, owner: 'model-catalog-engineer' },
  { match: /^components\/settings\//, owner: 'settings-by-screen' },
  { match: /^components\/ui\//, owner: 'TL' },
  { match: /^components\/shared\//, owner: 'TL' },
  { match: /^components\/drawer\//, owner: 'TL' },
  { match: /^components\/sidebar\//, owner: 'TL' },
  { match: /^components\/edge-cases\//, owner: 'edge-case-engineer' },
  { match: /^components\/vision\//, owner: 'vision-engineer' },
  { match: /^components\/translate\//, owner: 'translate-engineer' },
  { match: /^components\/performance\//, owner: 'performance-engineer' },
  { match: /^components\/[Pp]aywall\//, owner: 'cloud-mode-gate' },
  { match: /^components\/billing\//, owner: 'cloud-mode-gate' },
  { match: /^components\/auth\//, owner: 'cloud-mode-gate' },
  { match: /^components\/agents\//, owner: 'cloud-mode-gate' },
  { match: /^components\/companion\//, owner: 'cloud-mode-gate' },
  { match: /^components\/connectors\//, owner: 'cloud-mode-gate' },
  { match: /^components\/integrations\//, owner: 'cloud-mode-gate' },
  { match: /^components\/messaging\//, owner: 'cloud-mode-gate' },
  { match: /^components\/projects\//, owner: 'cloud-mode-gate' },
  { match: /^components\/schedules\//, owner: 'cloud-mode-gate' },
  { match: /^components\/image\//, owner: 'vision-engineer' },
  // Services
  { match: /^services\/streaming\.ts$/, owner: 'native-runtime-engineer' },
  { match: /^services\/api\.ts$/, owner: 'TL' },
  { match: /^services\/secureFetch\.ts$/, owner: 'TL' },
  { match: /^services\/supabase\.ts$/, owner: 'waitlist-engineer' },
  { match: /^services\/voice\.ts$/, owner: 'voice-engineer' },
  { match: /^services\/tts\.ts$/, owner: 'voice-engineer' },
  { match: /^services\/translate\.ts$/, owner: 'translate-engineer' },
  { match: /^services\/memory\.ts$/, owner: 'memory-engineer' },
  { match: /^services\/waitlist\.ts$/, owner: 'waitlist-engineer' },
  { match: /^services\/performanceMonitor\.ts$/, owner: 'performance-engineer' },
  { match: /^services\/notifications\.ts$/, owner: 'TL' },
  { match: /^services\/offlineQueue\.ts$/, owner: 'storage-engineer' },
  { match: /^services\/autotag\.ts$/, owner: 'chat-screen-engineer' },
  { match: /^services\/modelCatalog\.ts$/, owner: 'model-catalog-engineer' },
  { match: /^services\/billing\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/tierGuard\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/conversationSync\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/realtime\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/dispatchRealtime\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/heartbeat\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/healthData\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/imagegen\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/deviceIntegrations\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/fileCreation\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/skills\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/companion\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/companionNotifications\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/backgroundFetch\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/schedules\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/messaging\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^services\/usage\.ts$/, owner: 'cloud-mode-gate' },
  // Stores
  { match: /^stores\/chat\//, owner: 'chat-screen-engineer' },
  { match: /^stores\/modelStore\.ts$/, owner: 'model-catalog-engineer' },
  { match: /^stores\/settingsStore\.ts$/, owner: 'TL' },
  { match: /^stores\/memoryStore\.ts$/, owner: 'memory-engineer' },
  { match: /^stores\/notificationPrefsStore\.ts$/, owner: 'TL' },
  { match: /^stores\/tierStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/authStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/waitlistStore\.ts$/, owner: 'waitlist-engineer' },
  { match: /^stores\/connectionStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/crossDeviceStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/desktopStatusStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/messagingStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/agentControlStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/agentStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/dispatchStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/projectStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/scheduleStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/integrationStore\.ts$/, owner: 'cloud-mode-gate' },
  { match: /^stores\/skillsStore\.ts$/, owner: 'cloud-mode-gate' },
  // Storage layer
  { match: /^storage\//, owner: 'storage-engineer' },
  // Lib
  { match: /^lib\/theme\.ts$/, owner: 'TL' },
  { match: /^lib\/models\.ts$/, owner: 'model-catalog-engineer' },
  { match: /^lib\/mmkv\.ts$/, owner: 'storage-engineer' },
  { match: /^lib\/secureStorage\.ts$/, owner: 'storage-engineer' },
  { match: /^lib\/v1FeatureFlags\.ts$/, owner: 'cloud-mode-gate-engineer' },
  { match: /^lib\//, owner: 'TL' },
  // Hooks
  { match: /^hooks\//, owner: 'TL' },
  // Native
  { match: /^native\/ios\//, owner: 'native-runtime-engineer' },
  { match: /^native\/android\//, owner: 'native-runtime-engineer' },
  // Scripts
  { match: /^scripts\/release\//, owner: 'testflight-engineer' },
  { match: /^scripts\/screenshots\//, owner: 'test-engineer' },
  // Types
  { match: /^types\//, owner: 'TL' },
];

const LAYER_GUESS_RULES: Array<{ match: RegExp; layer: LayerGuess; role: string }> = [
  { match: /^app\//, layer: 'app', role: 'expo-route' },
  { match: /^components\/ui\//, layer: 'ui', role: 'ui-primitive' },
  { match: /^components\/shared\//, layer: 'ui', role: 'shared-component' },
  { match: /^components\/drawer\//, layer: 'ui', role: 'shared-component' },
  { match: /^components\/sidebar\//, layer: 'ui', role: 'shared-component' },
  { match: /^components\/[Pp]aywall\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/billing\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/auth\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/onboarding\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/waitlist\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/chat\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/voice\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/model-picker\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/settings\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/messaging\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/agents\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/companion\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/integrations\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/projects\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/schedules\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/vision\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/translate\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/performance\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/connectors\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/edge-cases\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/image\//, layer: 'features', role: 'feature-component' },
  { match: /^components\/[Cc]omposer\//, layer: 'features', role: 'feature-component' },
  { match: /^components\//, layer: 'features', role: 'feature-component' },
  {
    match: /^services\/(api|secureFetch|supabase)\.ts$/,
    layer: 'integrations',
    role: 'http-or-sdk',
  },
  { match: /^services\/streaming\.ts$/, layer: 'integrations', role: 'native-bridge' },
  { match: /^services\/realtime\.ts$/, layer: 'integrations', role: 'realtime' },
  { match: /^services\/notifications\.ts$/, layer: 'platform', role: 'push-adapter' },
  { match: /^services\/voice\.ts$/, layer: 'platform', role: 'voice-adapter' },
  { match: /^services\/tts\.ts$/, layer: 'platform', role: 'tts-adapter' },
  { match: /^services\/healthData\.ts$/, layer: 'platform', role: 'health-adapter' },
  { match: /^services\/healthKit/, layer: 'platform', role: 'health-adapter' },
  { match: /^services\/deviceIntegrations\.ts$/, layer: 'platform', role: 'device-adapter' },
  { match: /^services\/backgroundFetch\.ts$/, layer: 'platform', role: 'background-adapter' },
  { match: /^services\/offlineQueue\.ts$/, layer: 'storage', role: 'offline-queue' },
  { match: /^services\//, layer: 'features', role: 'feature-service' },
  { match: /^stores\/chat\//, layer: 'features', role: 'feature-store' },
  { match: /^stores\/[a-zA-Z]+Store\.ts$/, layer: 'features', role: 'feature-store' },
  { match: /^stores\//, layer: 'core', role: 'orchestration-store' },
  { match: /^storage\//, layer: 'storage', role: 'data-boundary' },
  { match: /^lib\/(mmkv|secureStorage)\.ts$/, layer: 'storage', role: 'storage-primitive' },
  { match: /^lib\/v1FeatureFlags\.ts$/, layer: 'core', role: 'feature-flags' },
  { match: /^lib\/theme\.ts$/, layer: 'ui', role: 'theme' },
  { match: /^lib\/models\.ts$/, layer: 'features', role: 'feature-data' },
  { match: /^lib\//, layer: 'core', role: 'utility' },
  { match: /^hooks\//, layer: 'core', role: 'hook' },
  { match: /^native\//, layer: 'platform', role: 'native-module' },
  { match: /^types\//, layer: 'core', role: 'type-defs' },
  { match: /^scripts\//, layer: 'unclassified', role: 'script' },
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    if (
      entry.startsWith('.') &&
      entry !== '.eslintrc' &&
      entry !== '.eslintrc.js' &&
      entry !== '.eslintrc.cjs'
    )
      continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (FILE_EXT.test(entry)) acc.push(full);
  }
  return acc;
}

function classify(rel: string): { layer: LayerGuess; role: string } {
  for (const rule of LAYER_GUESS_RULES) {
    if (rule.match.test(rel)) return { layer: rule.layer, role: rule.role };
  }
  return { layer: 'unclassified', role: 'unknown' };
}

function owner(rel: string): string {
  for (const rule of OWNER_RULES) {
    if (rule.match.test(rel)) return rule.owner;
  }
  return 'unassigned';
}

function countImports(filePath: string): { incoming: number; outgoing: number } {
  // Outgoing = static import lines in this file
  let outgoing = 0;
  try {
    const src = readFileSync(filePath, 'utf8');
    const lines = src.split('\n');
    for (const ln of lines) {
      if (/^\s*import\s+.+from\s+['"][^'"]+['"]/.test(ln)) outgoing++;
      else if (/^\s*import\s+['"][^'"]+['"]/.test(ln)) outgoing++;
    }
  } catch {
    /* skip unreadable */
  }
  // Incoming is computed in a second pass at index level (see main)
  return { incoming: 0, outgoing };
}

function main(): void {
  console.log(`[indexer] scanning ${MOBILE_ROOT}`);
  const files = walk(MOBILE_ROOT);
  console.log(`[indexer] found ${files.length} candidate files`);

  // Build basename->relative-path index for incoming-import counting (approximate)
  const baseToRel = new Map<string, string[]>();
  for (const f of files) {
    const rel = relative(MOBILE_ROOT, f);
    const base = basename(f).replace(/\.(tsx?|jsx?)$/, '');
    const list = baseToRel.get(base) ?? [];
    list.push(rel);
    baseToRel.set(base, list);
  }

  const records: FileRecord[] = [];
  const incomingCounter = new Map<string, number>();

  // First pass: classify + count outgoing
  for (const f of files) {
    const rel = relative(MOBILE_ROOT, f);
    const current_dir = rel.split('/')[0];
    const { layer, role } = classify(rel);
    const own = owner(rel);
    const { outgoing } = countImports(f);
    records.push({
      path: `apps/mobile/${rel}`,
      current_dir,
      proposed_dir: layer,
      role_guess: role,
      imports_in_count: 0, // filled below
      imports_out_count: outgoing,
      owner_role: own,
    });

    // Approximate incoming: parse import-from strings in this file and tally any that resolve to another mobile file
    try {
      const src = readFileSync(f, 'utf8');
      const importMatches = src.matchAll(/import\s+[^'"]*from\s+['"]([^'"]+)['"]/g);
      for (const m of importMatches) {
        const spec = m[1];
        if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
        // resolve relative to this file's dir
        let target: string;
        if (spec.startsWith('@/')) {
          target = join(MOBILE_ROOT, spec.slice(2));
        } else {
          target = resolve(dirname(f), spec);
        }
        const targetRel = relative(MOBILE_ROOT, target);
        // try candidates with extensions
        for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
          const cand = `${targetRel}${ext}`;
          if (files.some((x) => relative(MOBILE_ROOT, x) === cand)) {
            const key = cand;
            incomingCounter.set(key, (incomingCounter.get(key) ?? 0) + 1);
            break;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Second pass: stamp incoming counts onto records
  for (const r of records) {
    const rel = r.path.replace(/^apps\/mobile\//, '');
    r.imports_in_count = incomingCounter.get(rel) ?? 0;
  }

  // Write outputs
  const index = {
    generated_at: new Date().toISOString(),
    repo_root: REPO_ROOT,
    scope: 'apps/mobile/',
    excluded_dirs: Array.from(EXCLUDE_DIRS),
    total_files: records.length,
    files: records.sort((a, b) => a.path.localeCompare(b.path)),
  };
  const ownership = {
    generated_at: new Date().toISOString(),
    scope: 'apps/mobile/',
    by_owner: {} as Record<string, string[]>,
  };
  for (const r of records) {
    if (!ownership.by_owner[r.owner_role]) ownership.by_owner[r.owner_role] = [];
    ownership.by_owner[r.owner_role].push(r.path);
  }
  for (const k of Object.keys(ownership.by_owner)) ownership.by_owner[k].sort();

  writeFileSync(OUTPUT_INDEX, JSON.stringify(index, null, 2) + '\n');
  writeFileSync(OUTPUT_OWN, JSON.stringify(ownership, null, 2) + '\n');
  console.log(`[indexer] wrote ${OUTPUT_INDEX}`);
  console.log(`[indexer] wrote ${OUTPUT_OWN}`);
  console.log(
    `[indexer] ${records.length} files indexed across ${Object.keys(ownership.by_owner).length} owners`,
  );
}

main();
