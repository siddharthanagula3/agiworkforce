import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SecureStorageUnavailable } from '@/src/features/auth/components/SecureStorageUnavailable';

const MOBILE_ROOT = join(__dirname, '..');
const SOURCE_ROOTS = ['app', 'src', 'components', 'hooks', 'services', 'lib', 'stores', 'storage'];

const AUTH_PATHS = [/^app\/\(auth\)\//, /^src\/features\/auth\//, /^services\/authSession\.ts$/];
const WEBVIEW_IMPORT = /from 'react-native-webview'/;
// The two places a WebView renders untrusted content. Neither is an auth path,
// and no third may appear: a hand-rolled WebView sign-in is the pattern both
// stores reject and the one this contract exists to keep out.
const WEBVIEW_SURFACES = [
  'src/features/chat/components/MathBlock.tsx',
  'src/features/chat/components/SafeArtifactPreview.tsx',
];

// Every keychain write names when the item may be read. Without it iOS
// defaults to an item that survives to another device through a backup.
const SECURE_WRITE = /SecureStore\.setItemAsync\s*\(/g;
const KEYCHAIN_ACCESSIBLE = /keychainAccessible:\s*SecureStore\.WHEN_UNLOCKED_THIS_DEVICE_ONLY/;

// Probing for su binaries, Cydia or a writable system partition is a heuristic
// that fails open on the devices that matter and punishes ordinary users.
const DEVICE_INTEGRITY_PROBE =
  /\b(jailbr(oken|eak)|isRooted|RootBeer|Cydia|SafetyNet|\/system\/bin\/su)\b/i;

// The OS grants a permission prompt once per install. Spending it from a
// lifecycle effect asks before the user has reached the feature.
const PERMISSION_REQUEST = /\brequest(Camera|Microphone|Media|Tracking)?PermissionsAsync\s*\(/;
// Each of these asks from a control the user just pressed: the composer's
// camera action, the voice button, the notification primer, the permissions
// screen. Nothing else in the app may ask.
const JUST_IN_TIME_CALLERS = [
  'app/(app)/(tabs)/chat.tsx',
  'app/(app)/chat/[id].tsx',
  'services/notifications.ts',
  'src/features/settings/permissions/registry.ts',
  'src/features/voice/services/voiceInput.ts',
];
const LAUNCH_SURFACES = /^app\/_layout\.tsx$|^app\/\(public\)\/|^src\/features\/onboarding\//;

const CLOUD_CREDENTIAL = /\b(getToken|signIn|signOut|createdSessionId|setActive|useAuth)\b/;
const LOCAL_UNLOCK_MODULES = [
  'src/features/auth/hooks/useBiometricGate.ts',
  'lib/biometricFlagStore.ts',
  'src/features/auth/components/AppLockOverlay.tsx',
];

function sourceFiles(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['__tests__', '__mocks__', 'node_modules'].includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      found.push({ path: relative(MOBILE_ROOT, full), text: readFileSync(full, 'utf8') });
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(MOBILE_ROOT, root));
  return found;
}

const FILES = sourceFiles();
const ROOT_LAYOUT = readFileSync(join(MOBILE_ROOT, 'app', '_layout.tsx'), 'utf8');
const APP_CONFIG = readFileSync(join(MOBILE_ROOT, 'app.config.js'), 'utf8');
const isAuthPath = (path: string) => AUTH_PATHS.some((pattern) => pattern.test(path));

describe('the mobile tree', () => {
  it('has source to sweep, so an empty result cannot pass any of these', () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES.filter((file) => isAuthPath(file.path)).length).toBeGreaterThan(5);
  });
});

describe('signing in happens in the system browser, not in our own', () => {
  it('renders no WebView on any authentication path', () => {
    const webviews = FILES.filter((file) => WEBVIEW_IMPORT.test(file.text)).map(
      (file) => file.path,
    );

    expect(webviews.filter(isAuthPath)).toEqual([]);
    expect(webviews.sort()).toEqual(WEBVIEW_SURFACES);
  });

  it('hands the sign-in screen to the platform auth view rather than a form of ours', () => {
    const login = readFileSync(join(MOBILE_ROOT, 'app', '(auth)', 'login.tsx'), 'utf8');

    expect(login).toContain("from '@clerk/expo/native'");
    expect(login).toContain('<AuthView');
    expect(login).not.toMatch(/secureTextEntry|<TextInput/);
  });

  it('declares the callback the browser hands control back through', () => {
    expect(APP_CONFIG).toMatch(/scheme:\s*'agiworkforce'/);
    expect(APP_CONFIG).toContain('associatedDomains');
  });
});

describe('a session outlives the process that made it', () => {
  it('gives the provider the secure token cache instead of memory', () => {
    expect(ROOT_LAYOUT).toContain("from '@clerk/expo/token-cache'");
    expect(ROOT_LAYOUT).toMatch(/<ClerkProvider[^>]*[\s\S]*?tokenCache=\{tokenCache\}/);
  });

  it('persists the account store to the keychain, not to the unencrypted store', () => {
    const store = readFileSync(join(MOBILE_ROOT, 'src', 'features', 'auth', 'store.ts'), 'utf8');

    expect(store).toContain("from '@/lib/secureStorage'");
    expect(store).toContain('createJSONStorage(() => secureStorage)');
  });

  it('asks the keychain to keep every stored secret on this device alone', () => {
    const missing = FILES.filter((file) => {
      const writes = file.text.match(SECURE_WRITE);
      return writes !== null && !KEYCHAIN_ACCESSIBLE.test(file.text);
    }).map((file) => file.path);

    expect(missing).toEqual([]);
    expect(FILES.filter((file) => SECURE_WRITE.test(file.text)).length).toBeGreaterThan(1);
  });
});

describe('unlocking the app is not signing in to the account', () => {
  it('mints no cloud credential anywhere on the unlock path', () => {
    const unlock = FILES.filter((file) => LOCAL_UNLOCK_MODULES.includes(file.path));

    expect(unlock.map((file) => file.path).sort()).toEqual([...LOCAL_UNLOCK_MODULES].sort());
    expect(unlock.filter((file) => CLOUD_CREDENTIAL.test(file.text)).map((f) => f.path)).toEqual(
      [],
    );
  });

  it('is a device-local preference the account never turns on', () => {
    const flagStore = readFileSync(join(MOBILE_ROOT, 'lib', 'biometricFlagStore.ts'), 'utf8');

    expect(flagStore).toContain('expo-secure-store');
    expect(flagStore).not.toMatch(/fetch\s*\(|API_URL|clerk/i);
  });
});

describe('the app makes no guess about how the device was modified', () => {
  it('probes for no root or jailbreak artefact anywhere', () => {
    const probing = FILES.filter((file) => DEVICE_INTEGRITY_PROBE.test(file.text)).map(
      (file) => file.path,
    );

    expect(probing).toEqual([]);
  });
});

describe('an OS permission is asked for at the moment it is needed', () => {
  it('is requested only by the feature that needs it, never from a lifecycle effect', () => {
    const requesters = FILES.filter((file) => PERMISSION_REQUEST.test(file.text)).map(
      (file) => file.path,
    );

    expect(requesters.sort()).toEqual([...JUST_IN_TIME_CALLERS].sort());
  });

  it('asks for nothing on the way in, before the user has reached a feature', () => {
    const launch = FILES.filter((file) => LAUNCH_SURFACES.test(file.path));

    expect(launch.length).toBeGreaterThan(3);
    expect(launch.filter((file) => PERMISSION_REQUEST.test(file.text)).map((f) => f.path)).toEqual(
      [],
    );
  });
});

describe('text the device made bigger stays readable while signing in', () => {
  it('remeasures the whole tree when the system type size changes', () => {
    expect(ROOT_LAYOUT).toContain('<TextScaleBoundary>');
  });

  it('pins no label to a fixed size against the system setting', () => {
    const pinned = FILES.filter((file) =>
      /allowFontScaling\s*=?\s*\{?\s*false/.test(file.text),
    ).map((file) => file.path);

    expect(pinned).toEqual([]);
  });
});

describe('when the encrypted store will not open', () => {
  it('says nothing was lost and offers the one action that can help', () => {
    const onRetry = jest.fn();

    render(<SecureStorageUnavailable onRetry={onRetry} />);

    expect(screen.getByTestId('secure-storage-unavailable')).toBeTruthy();
    expect(screen.getByText(/Nothing has been deleted/)).toBeTruthy();
    expect(screen.getByText(/Unlock this device and try again/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('secure-storage-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('is what the app shows instead of running on a store that reads empty', () => {
    expect(ROOT_LAYOUT).toMatch(/storageStatus === 'unavailable'/);
    expect(ROOT_LAYOUT).toContain('<SecureStorageUnavailable');
  });
});
