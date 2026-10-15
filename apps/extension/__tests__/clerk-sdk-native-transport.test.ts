import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('installed Clerk native transport', () => {
  it.each([
    { instance: 'production', prefix: 'pk_live_', cookieName: '__client' },
    { instance: 'development', prefix: 'pk_test_', cookieName: '__clerk_db_jwt' },
  ])(
    'reads and attaches the $instance Sync Host cookie through the native client API',
    ({ prefix, cookieName }) => {
      const output = execFileSync(process.execPath, ['--input-type=module', '-'], {
        cwd: appRoot,
        encoding: 'utf8',
        input: `
        import assert from 'node:assert/strict';
        import { registerHooks } from 'node:module';
        globalThis.agiClerkProbe = { cookieReads: [] };
        const modules = {
          '@clerk/clerk-js/no-rhc': \
            'export class Clerk { static sdkMetadata = {}; __internal_onBeforeRequest(handler) { this.beforeRequest = handler; } __internal_onAfterResponse() {} async load(options) { this.loadOptions = options; return this; } }',
          'webextension-polyfill': \
            'export default { runtime: { getManifest: () => ({ permissions: ["storage", "cookies"], host_permissions: ["https://clerk-test.invalid/*"], background: { service_worker: "src/background.js" } }) }, cookies: { get: async (options) => { globalThis.agiClerkProbe.cookieReads.push(options); return { value: "test-client-cookie" }; } }, storage: { local: { get: async () => ({}), set: async () => undefined, remove: async () => undefined } } };',
        };
        registerHooks({
          resolve(specifier, context, nextResolve) {
            return modules[specifier]
              ? { url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true }
              : nextResolve(specifier, context);
          },
        });
        const { createClerkClient } = await import('@clerk/chrome-extension/client');
        const client = await createClerkClient({
          publishableKey: '${prefix}Y2xlcmstdGVzdC5pbnZhbGlkJA',
          syncHost: 'https://clerk-test.invalid',
          background: true,
        });
        assert.equal(client.loadOptions.standardBrowser, false);
        const request = {
          url: new URL('https://clerk-test.invalid/v1/client'),
          headers: new Headers(),
          credentials: 'include',
        };
        await client.beforeRequest(request);
        assert.deepEqual(globalThis.agiClerkProbe.cookieReads, [{ name: '${cookieName}', url: 'https://clerk-test.invalid' }]);
        if ('${prefix}' === 'pk_live_') {
          assert.equal(request.headers.get('authorization'), 'Bearer test-client-cookie');
          assert.equal(request.url.searchParams.get('_is_native'), '1');
        } else {
          assert.equal(request.headers.get('authorization'), null);
          assert.equal(request.url.searchParams.get('__clerk_db_jwt'), 'test-client-cookie');
        }
        assert.equal(request.credentials, 'omit');
        process.stdout.write('native-sync-verified');
      `,
      });

      expect(output).toBe('native-sync-verified');
    },
  );
});
