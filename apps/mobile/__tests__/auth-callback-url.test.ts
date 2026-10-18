import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

function productionConfig() {
  const overrides = {
    APP_ENV: 'production',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_auth_callback_fixture',
    EXPO_PUBLIC_API_URL: 'https://example.com',
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, overrides);
    return jest.requireActual('../app.config.js').expo;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function installedCreateURL(platform: 'ios' | 'android') {
  const packageRoot = dirname(require.resolve('expo-linking/package.json'));
  const modules: Record<string, unknown> = {
    'expo-constants': {
      default: { expoConfig: productionConfig(), executionEnvironment: 'standalone' },
      ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
    },
    'expo-modules-core': {
      Platform: {
        OS: platform,
        select: (values: Record<string, unknown>) => values[platform] ?? values.default,
      },
    },
    invariant: { default: jest.requireActual('invariant') },
  };
  function load(name: string): Record<string, unknown> {
    const source = readFileSync(join(packageRoot, 'src', `${name}.ts`), 'utf8');
    const { outputText } = transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    });
    const exports = {};
    runInNewContext(outputText, {
      exports,
      require: (id: string) => {
        if (!(id in modules)) throw new Error(`Unexpected Expo Linking import: ${id}`);
        return modules[id];
      },
      __DEV__: false,
      URL,
      URLSearchParams,
      encodeURI,
      console,
    });
    return exports;
  }
  modules['./Schemes'] = load('Schemes');
  modules['./validateURL'] = load('validateURL');
  return load('createURL').createURL as typeof import('expo-linking').createURL;
}

describe.each(['ios', 'android'] as const)('%s production auth callback', (platform) => {
  it('uses the installed Expo URL construction with the production app config', () => {
    const createURL = installedCreateURL(platform);
    expect(createURL('/login')).toBe('agiworkforce:///login');
    expect(createURL('/login', { queryParams: { postAuthIntent: 'cloud-schedules' } })).toBe(
      'agiworkforce:///login?postAuthIntent=cloud-schedules',
    );
  });
});
