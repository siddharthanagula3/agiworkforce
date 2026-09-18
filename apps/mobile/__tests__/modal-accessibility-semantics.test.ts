import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const SEARCH_DIRS = ['app', 'src', 'components'];

// A React Native Modal renders into its own native window, and without this
// flag VoiceOver and TalkBack keep reading the screen behind it (MOBILE-066).
const REQUIRED_PROP = 'accessibilityViewIsModal';

// Each of these is a live defect owned by another lane. Shrink this list, never
// grow it: a new Modal must ship the flag.
const PENDING: ReadonlySet<string> = new Set([
  'src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx',
  'src/features/tasks/components/StartWorkSheet.tsx',
  'src/features/tasks/components/CloudRunDetailSheet.tsx',
  'src/shared/components/ApprovalModal.tsx',
  'src/features/schedules/components/QuickSchedule.tsx',
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === '__mocks__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (entry.endsWith('.tsx') && !entry.includes('.test.')) {
      found.push(full);
    }
  }
  return found;
}

function modalFiles(): string[] {
  const files: string[] = [];
  for (const dir of SEARCH_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      if (/<Modal[\s>]/.test(readFileSync(file, 'utf8'))) {
        files.push(relative(ROOT, file));
      }
    }
  }
  return files.sort();
}

describe('every modal claims the screen from assistive technology', () => {
  const files = modalFiles();

  it('finds the modals to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.filter((file) => !PENDING.has(file)))('%s declares the flag', (file) => {
    expect(readFileSync(join(ROOT, file), 'utf8')).toContain(REQUIRED_PROP);
  });

  it('keeps the pending list honest: a fixed file must leave it', () => {
    const stillMissing = files.filter(
      (file) => !readFileSync(join(ROOT, file), 'utf8').includes(REQUIRED_PROP),
    );
    expect(stillMissing.sort()).toEqual([...PENDING].sort());
  });
});
