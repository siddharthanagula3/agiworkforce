import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(mobileRoot, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const clerkManifest = JSON.parse(
  readFileSync(require.resolve('@clerk/expo/package.json'), 'utf8'),
) as {
  peerDependencies: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};
const signInSource = readFileSync(
  join(mobileRoot, 'src/features/auth/components/MobileSignIn.tsx'),
  'utf8',
);

// Clerk declares these as optional peers and loads them only when a provider
// button is pressed, so a missing one passes install, typecheck and every
// mocked test, and fails on the device with a generic sign-in error.
const PACKAGES_CLERK_LOADS_FOR_PROVIDER_SIGN_IN = ['expo-auth-session', 'expo-web-browser'];

describe('provider sign-in packages', () => {
  it('still signs in with providers through the hook that needs them', () => {
    expect(signInSource).toContain("import { useSSO } from '@clerk/expo/experimental';");
  });

  it.each(PACKAGES_CLERK_LOADS_FOR_PROVIDER_SIGN_IN)(
    '%s is an optional Clerk peer, so nothing but this app installs it',
    (name) => {
      expect(clerkManifest.peerDependencies).toHaveProperty(name);
      expect(clerkManifest.peerDependenciesMeta?.[name]?.optional).toBe(true);
    },
  );

  it.each(PACKAGES_CLERK_LOADS_FOR_PROVIDER_SIGN_IN)('%s is declared and installed', (name) => {
    expect(manifest.dependencies).toHaveProperty(name);
    expect(() => require.resolve(`${name}/package.json`)).not.toThrow();
  });
});
