import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const APP_ROOT = join(__dirname, '..', '..', '..', '..');
const SOURCE_DIRECTORIES = ['app', 'src', 'stores', 'services', 'components', 'hooks', 'lib'];
const SKIPPED_DIRECTORIES = new Set(['__tests__', '__mocks__', 'node_modules']);
const REACT_NAVIGATION_IMPORT =
  /(?:from\s+|import\s+|require\(\s*|import\(\s*)['"]@react-navigation\/[^'"]+['"]/;

function sourceFiles(directory: string): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(path);
    if (!/\.(?:ts|tsx|js|jsx)$/.test(entry.name) || /\.test\.(?:ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

describe('navigation imports in app source', () => {
  it('reads React Navigation through expo-router, whose screens provide the context', () => {
    const files = SOURCE_DIRECTORIES.flatMap((directory) => sourceFiles(join(APP_ROOT, directory)));
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter((file) => REACT_NAVIGATION_IMPORT.test(readFileSync(file, 'utf8')))
      .map((file) => relative(APP_ROOT, file));
    expect(offenders).toEqual([]);
  });
});
