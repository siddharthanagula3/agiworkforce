import fs from 'node:fs';
import path from 'node:path';

describe('Clerk native pending-session policy', () => {
  it('keeps every production auth-state hook pending until Clerk resolves the session', () => {
    const appRoot = path.join(__dirname, '..', 'app');
    const sourceFiles: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolutePath);
        else if (/\.tsx?$/.test(entry.name)) sourceFiles.push(absolutePath);
      }
    };
    visit(appRoot);

    const authConsumers = sourceFiles.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return /import\s*\{[^}]*\buseAuth\b[^}]*\}\s*from\s*['"]@clerk\/expo['"]/.test(source);
    });

    expect(authConsumers).toHaveLength(2);
    for (const file of authConsumers) {
      const source = fs.readFileSync(file, 'utf8');
      const executableSource = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(source).toContain('useAuth(CLERK_NATIVE_AUTH_OPTIONS)');
      expect(executableSource).not.toMatch(/\buseAuth\(\s*\)/);
    }
  });
});
