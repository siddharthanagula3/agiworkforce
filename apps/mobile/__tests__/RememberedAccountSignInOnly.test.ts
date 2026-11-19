import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const SOURCE_DIRS = ['app', 'src', 'services', 'stores', 'components', 'lib', 'hooks'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (entry === 'node_modules' || entry === '__tests__') return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

function filesMatching(pattern: RegExp): string[] {
  return SOURCE_DIRS.flatMap((dir) => {
    const full = path.join(ROOT, dir);
    return statSync(full, { throwIfNoEntry: false }) ? sourceFiles(full) : [];
  })
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file))
    .sort();
}

describe('the remembered account stays on the Cloud sign-in screen', () => {
  it('is read only by the sign-in component', () => {
    expect(filesMatching(/\breadRememberedAccount(ForSignIn)?\b/)).toEqual([
      'src/features/auth/components/MobileSignIn.tsx',
      'src/features/auth/services/rememberedAccount.ts',
    ]);
  });

  it('is shown only where the sign-in component is mounted, the Cloud sign-in route', () => {
    expect(filesMatching(/components\/MobileSignIn['"]/)).toEqual(['app/(auth)/login.tsx']);
  });
});
