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

  it('does not clear cached account entitlements during Clerk pending state', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const bridge = source.slice(
      source.indexOf('function ClerkTokenBridge()'),
      source.indexOf('export default function RootLayout()'),
    );

    expect(bridge).toMatch(/useEffect\(\(\) => \{\s+if \(!isLoaded\) return;\s+if \(isSignedIn\)/);
  });

  it('returns to Local only after Clerk definitively resolves signed out', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const bridge = source.slice(
      source.indexOf('function ClerkTokenBridge()'),
      source.indexOf('export default function RootLayout()'),
    );
    const loadedGuardIndex = bridge.indexOf('if (!isLoaded) return;');
    const localResetIndex = bridge.indexOf('clearLocalCloudAccountState();', loadedGuardIndex);

    expect(loadedGuardIndex).toBeGreaterThan(-1);
    expect(localResetIndex).toBeGreaterThan(loadedGuardIndex);
    expect(bridge.slice(loadedGuardIndex, localResetIndex)).toContain('if (isSignedIn)');
  });

  it('clears every Cloud account cache when Clerk expires without recursive sign-out', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const bridge = source.slice(
      source.indexOf('function ClerkTokenBridge()'),
      source.indexOf('export default function RootLayout()'),
    );
    const loadedGuardIndex = bridge.indexOf('if (!isLoaded) return;');
    const teardownIndex = bridge.indexOf('clearLocalCloudAccountState();', loadedGuardIndex);

    expect(source).toContain(
      "import { clearLocalCloudAccountState } from '@/src/features/auth/services/cloudAccountTeardown';",
    );
    expect(teardownIndex).toBeGreaterThan(loadedGuardIndex);
    expect(bridge).not.toContain('useAuthStore.getState().signOut(');
  });

  it('binds caches to Clerk userId and clears on a direct account A-to-B switch', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const bridge = source.slice(
      source.indexOf('function ClerkTokenBridge()'),
      source.indexOf('export default function RootLayout()'),
    );
    const activateIndex = bridge.indexOf('const owner = activateCloudAccount(userId);');
    const signedInIndex = bridge.indexOf('setClerkSignedIn(true);');

    expect(source).toContain(
      "import {\n  activateCloudAccount,\n  invalidateCloudAccount,\n} from '@/src/features/auth/services/cloudAccountSession';",
    );
    expect(activateIndex).toBeGreaterThan(bridge.indexOf('if (isSignedIn)'));
    expect(activateIndex).toBeLessThan(signedInIndex);
    expect(bridge).toMatch(/if \(owner\.changed\) \{\s*clearLocalCloudAccountState\(\);/);
    expect(bridge).toContain('invalidateCloudAccount();');
  });

  it('syncs immediately only on an authenticated Local-to-Cloud transition', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

    expect(source).toContain(
      "import { startCloudSyncLoop, stopCloudSyncLoop, syncNow } from '@/services/cloudSyncEngine';",
    );
    expect(source).toMatch(/const previousIsCloudRef = useRef\(isCloud\)/);
    expect(source).toMatch(/const enteredCloud = isCloud && !previousIsCloudRef\.current/);
    expect(source).toMatch(/if \(enteredCloud && isMmkvReady\) void syncNow\(\)/);
  });

  it('restarts every account-scoped root lifecycle on a direct Clerk account switch', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

    expect(source).toContain('const clerkUserId = useAuthStore((state) => state.clerkUserId);');
    expect(source).toContain('beginPushTokenAccountSession(clerkUserId, getAuthToken)');
    expect(source).toContain('[isMmkvReady, isClerkSignedIn, clerkUserId]');
    expect(source).toContain('[isClerkSignedIn, clerkUserId, isInitialized, refreshTier]');
    expect(source).toContain('[isClerkSignedIn, clerkUserId, refreshTier]');
    expect(source).toContain('[isClerkSignedIn, clerkUserId, isCloud, isMmkvReady, refreshTier]');
    expect(source).toContain('[isClerkSignedIn, clerkUserId, isCloud, isInitialized]');
    expect(source).toContain('[isClerkSignedIn, clerkUserId]');
  });
});
