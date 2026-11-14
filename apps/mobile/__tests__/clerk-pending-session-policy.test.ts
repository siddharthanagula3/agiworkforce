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

  it('holds credentials while Clerk loads and answers for them when it never does', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const bridge = source.slice(
      source.indexOf('function ClerkTokenBridge()'),
      source.indexOf('export default function RootLayout()'),
    );
    const loadingEffect = bridge.slice(
      bridge.indexOf('if (isLoaded) return;'),
      bridge.indexOf('if (!isLoaded) return;'),
    );

    expect(loadingEffect).toMatch(/if \(isLoaded\) return;\s+holdTokensUntilClerkAnswers\(\);/);
    expect(loadingEffect).toMatch(
      /setTimeout\(\(\) => \{[\s\S]*setClerkTokenMinter\(null, null\);[\s\S]*\}, CLERK_LOAD_SETTLE_MS\)/,
    );
  });

  it('does not report a signed-in session as loaded and signed out while its Terms answer is in flight', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const bridge = source.slice(
      source.indexOf('function ClerkTokenBridge()'),
      source.indexOf('export default function RootLayout()'),
    );
    const notAccepted = bridge.slice(
      bridge.indexOf("termsStatus !== 'accepted'"),
      bridge.indexOf('const owner = activateCloudAccount(userId);'),
    );

    expect(notAccepted).toMatch(
      /setClerkSignedIn\(false\);\s+if \(!isTermsAnswerPending\(\{ userId: termsUserId, status: termsStatus \}, userId\)\) \{\s+setClerkLoaded\(true\);\s+\}\s+return;/,
    );
    expect(notAccepted.match(/setClerkLoaded\(true\)/g)).toHaveLength(1);
    expect(bridge).toMatch(
      /if \(!termsAnswerPending\) return;\s+const settle = setTimeout\(\(\) => setClerkLoaded\(true\), CLERK_LOAD_SETTLE_MS\);/,
    );
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

  it('owes a sign-in only for a session that ended while its Cloud owner was still recorded', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const bridge = source.slice(
      source.indexOf('function ClerkTokenBridge()'),
      source.indexOf('export default function RootLayout()'),
    );
    const signedOut = bridge.slice(bridge.indexOf('} else {', bridge.indexOf('if (isSignedIn)')));
    const owedIndex = signedOut.indexOf('if (hasCloudAccountOwner()) oweSignInForEndedSession();');
    const ownerRetiredIndex = signedOut.indexOf('invalidateCloudAccount();');

    expect(owedIndex).toBeGreaterThan(-1);
    expect(ownerRetiredIndex).toBeGreaterThan(owedIndex);

    const routing = source.slice(source.indexOf('const redirect = resolveRootRedirect({'));
    expect(routing).toContain('signInOwedForEndedSession: isSignInOwedForEndedSession(),');
    expect(routing).toContain(
      'if (redirect?.pathname === CLOUD_SIGN_IN_RETURN_PATH) settleSignInForEndedSession();',
    );
  });

  it('retires the Cloud owner before every sign-out a person chooses', () => {
    const layout = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const appLockReset = layout.slice(layout.indexOf("'Reset and sign out'"));
    expect(appLockReset.indexOf('invalidateCloudAccount();')).toBeGreaterThan(-1);
    expect(appLockReset.indexOf('invalidateCloudAccount();')).toBeLessThan(
      appLockReset.indexOf('await clearAuthSession();'),
    );

    const store = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'features', 'auth', 'store.ts'),
      'utf8',
    );
    const retire = store.slice(
      store.indexOf('function retireActiveCloudAccount('),
      store.indexOf('async function endEveryDeviceSession('),
    );
    expect(retire.indexOf('invalidateCloudAccount();')).toBeGreaterThan(-1);

    const endEverySession = store.slice(store.indexOf('async function endEveryDeviceSession('));
    expect(endEverySession.indexOf('retireActiveCloudAccount(set);')).toBeGreaterThan(-1);
    expect(endEverySession.indexOf('retireActiveCloudAccount(set);')).toBeLessThan(
      endEverySession.indexOf('await clearAuthSession();'),
    );

    const signOut = store.slice(
      store.indexOf('signOut: async () => {'),
      store.indexOf('signOutAllAccounts: async () => {'),
    );
    expect(signOut.indexOf('await endEveryDeviceSession(set,')).toBeGreaterThan(-1);
    expect(signOut.indexOf('retireActiveCloudAccount(set);')).toBeGreaterThan(-1);
    expect(signOut.indexOf('retireActiveCloudAccount(set);')).toBeLessThan(
      signOut.indexOf('await clearAuthSession();'),
    );

    const signOutAllAccounts = store.slice(store.indexOf('signOutAllAccounts: async () => {'));
    expect(signOutAllAccounts.indexOf('await endEveryDeviceSession(set,')).toBeGreaterThan(-1);
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
      "import {\n  activateCloudAccount,\n  hasCloudAccountOwner,\n  invalidateCloudAccount,\n  recordedCloudAccountOwnerId,\n} from '@/src/features/auth/services/cloudAccountSession';",
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
    expect(source).toContain(
      'usePushTokenAccountRegistration({ isClerkSignedIn, clerkUserId, isCloud, isInitialized });',
    );
    const pushRegistration = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'src',
        'features',
        'auth',
        'hooks',
        'usePushTokenAccountRegistration.ts',
      ),
      'utf8',
    );
    expect(pushRegistration).toContain('beginPushTokenAccountSession(clerkUserId, getAuthToken)');
    const pushDependencies = [...pushRegistration.matchAll(/\}, \[([^\]]*)\]\);/g)].map((match) =>
      (match[1] ?? '').split(',').map((name) => name.trim()),
    );
    expect(pushDependencies).toHaveLength(1);
    expect(pushDependencies[0]).toEqual(expect.arrayContaining(['isClerkSignedIn', 'clerkUserId']));

    // Read as normalized dependency sets rather than source substrings: the
    // previous form pinned six exact one-line arrays, so adding a dependency to
    // any of them failed the test for formatting rather than for behaviour, and
    // said nothing about which effect had changed.
    const dependencySets = [...source.matchAll(/\}, \[([^\]]*)\]\);/g)].map((match) =>
      (match[1] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    );
    const accountScoped = dependencySets.filter((deps) => deps.includes('isClerkSignedIn'));

    // Two effects are deliberately not account-scoped: one mirrors the signed-in
    // boolean onto the notification service, the other reacts to a pairing URL.
    const notAccountScoped = accountScoped.filter((deps) => !deps.includes('clerkUserId'));
    expect(notAccountScoped).toEqual([
      ['isClerkSignedIn'],
      ['url', 'isClerkSignedIn', 'isInitialized', 'router'],
    ]);

    // Everything else that reads the session must re-run when the person behind
    // it changes, including the router effect, whose onboarding and age-gate
    // reads come from per-account storage.
    const routing = accountScoped.find((deps) => deps.includes('segments'));
    expect(routing).toBeDefined();
    expect(routing).toContain('clerkUserId');
    expect(accountScoped.filter((deps) => deps.includes('clerkUserId'))).toHaveLength(6);
  });
});
