import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const MOBILE_ROOT = join(__dirname, '..');
const SOURCE_DIRS = ['app', 'src', 'stores', 'lib', 'components', 'services'];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('tool approvals are decided by the server', () => {
  it('keeps no client-side list of tools allowed for a chat', () => {
    expect(existsSync(join(MOBILE_ROOT, 'src/features/chat/store/chatToolAllowanceStore.ts'))).toBe(
      false,
    );
    const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(MOBILE_ROOT, dir)));
    expect(files.length).toBeGreaterThan(100);
    const readers = files.filter((file) =>
      /chatToolAllowanceStore|useToolsAllowedForChat|allowedByConversation/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(readers).toEqual([]);
  });
});
