import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  REPO_ROOT,
  checkMobilePrimitives,
  loadBaseline,
  rawPrimitiveImports,
} from './check-mobile-primitives.mjs';

const roots = [];

function tree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-mobile-primitives-'));
  roots.push(root);
  for (const [relative, source] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const RAW_SCREEN =
  "import { Pressable, Text, View } from 'react-native';\nexport const Screen = () => null;\n";
const PRIMITIVE_SCREEN =
  "import { View } from 'react-native';\nimport { Text } from '@/components/ui/text';\nexport const Screen = () => null;\n";

test('the tree as it stands adds no raw primitive beyond the baseline', () => {
  assert.deepEqual(checkMobilePrimitives(REPO_ROOT).failures, []);
});

test('a new screen importing raw react-native primitives fails', () => {
  const root = tree({ 'apps/mobile/src/features/example/Screen.tsx': RAW_SCREEN });
  const { failures } = checkMobilePrimitives(root, { modules: [] });
  assert.ok(
    failures.some((entry) =>
      /example\/Screen\.tsx imports Pressable, Text from react-native/.test(entry),
    ),
    failures.join('\n'),
  );
});

test('the primitive layer itself may use react-native directly', () => {
  const root = tree({ 'apps/mobile/components/ui/text.tsx': RAW_SCREEN });
  assert.deepEqual(checkMobilePrimitives(root, { modules: [] }).failures, []);
});

test('a recorded screen that moves onto the primitives fails until its entry goes', () => {
  const file = 'apps/mobile/src/features/example/Screen.tsx';
  const before = tree({ [file]: RAW_SCREEN });
  assert.deepEqual(checkMobilePrimitives(before, { modules: [file] }).failures, []);
  const after = tree({ [file]: PRIMITIVE_SCREEN });
  assert.ok(
    checkMobilePrimitives(after, { modules: [file] }).failures.some((entry) =>
      /no longer imports a raw primitive/.test(entry),
    ),
  );
});

test('type-only and aliased imports are read by their imported name', () => {
  assert.deepEqual(
    rawPrimitiveImports(
      "import {\n  type ViewStyle,\n  TouchableOpacity as Touch,\n  StyleSheet,\n} from 'react-native';",
    ),
    ['TouchableOpacity'],
  );
  assert.deepEqual(rawPrimitiveImports("import { View } from 'react-native';"), []);
  assert.ok(Array.isArray(loadBaseline(REPO_ROOT).modules));
});
