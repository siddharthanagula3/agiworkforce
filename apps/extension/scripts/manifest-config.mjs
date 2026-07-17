function normalizeOrigin(value, name, { allowLocalhost = false } = {}) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${name} must be an absolute URL origin.`);
  }

  const localDevelopmentOrigin =
    allowLocalhost &&
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localDevelopmentOrigin) {
    throw new Error(`${name} must use HTTPS (HTTP is allowed only for localhost development).`);
  }
  if (
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an origin only, without credentials, path, query, or hash.`);
  }
  return url.origin;
}

function appendUnique(values, value) {
  if (value && !values.includes(value)) values.push(value);
}

function appendConnectSource(policy, origin) {
  if (!origin) return policy;
  const connectSource = /connect-src ([^;]+)/.exec(policy);
  if (!connectSource || connectSource[1].split(/\s+/).includes(origin)) return policy;
  return policy.replace(/connect-src ([^;]+)/, `connect-src $1 ${origin}`);
}

export function configureChromeManifest(sourceManifest, configuration) {
  const manifest = structuredClone(sourceManifest);
  const frontendApi = normalizeOrigin(configuration.clerkFrontendApi, 'CLERK_FRONTEND_API', {
    allowLocalhost: true,
  });
  const syncHost = normalizeOrigin(configuration.clerkSyncHost, 'CLERK_SYNC_HOST', {
    allowLocalhost: true,
  });

  manifest.host_permissions = [...(manifest.host_permissions ?? [])];
  appendUnique(manifest.host_permissions, frontendApi ? `${frontendApi}/*` : undefined);
  appendUnique(manifest.host_permissions, syncHost ? `${syncHost}/*` : undefined);

  let extensionPages = manifest.content_security_policy?.extension_pages ?? '';
  extensionPages = appendConnectSource(extensionPages, frontendApi);
  extensionPages = appendConnectSource(extensionPages, syncHost);
  manifest.content_security_policy = {
    ...manifest.content_security_policy,
    extension_pages: extensionPages,
  };

  const publicKey = configuration.chromeExtensionPublicKey?.trim();
  if (publicKey) manifest.key = publicKey;
  return manifest;
}

export function validateReleaseManifest(manifest, configuration) {
  const frontendApi = normalizeOrigin(configuration.clerkFrontendApi, 'CLERK_FRONTEND_API');
  const syncHost = normalizeOrigin(configuration.clerkSyncHost, 'CLERK_SYNC_HOST');
  if (!frontendApi) throw new Error('CLERK_FRONTEND_API is required for a production package.');
  if (!syncHost) throw new Error('CLERK_SYNC_HOST is required for a production package.');
  if (!configuration.clerkPublishableKey?.trim().startsWith('pk_live_')) {
    throw new Error('A live CLERK_PUBLISHABLE_KEY is required for a production package.');
  }
  if (!configuration.chromeExtensionPublicKey?.trim()) {
    throw new Error(
      'CHROME_EXTENSION_PUBLIC_KEY is required so the production CRX ID remains stable.',
    );
  }
  if (manifest.key !== configuration.chromeExtensionPublicKey.trim()) {
    throw new Error('The built manifest does not contain the configured stable CRX public key.');
  }
  for (const origin of [frontendApi, syncHost]) {
    if (!manifest.host_permissions?.includes(`${origin}/*`)) {
      throw new Error(`The built manifest is missing required host permission ${origin}/*.`);
    }
  }
}

export function readChromeBuildConfiguration(env) {
  return {
    clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY,
    clerkFrontendApi: env.CLERK_FRONTEND_API,
    clerkSyncHost: env.CLERK_SYNC_HOST,
    chromeExtensionPublicKey: env.CHROME_EXTENSION_PUBLIC_KEY,
  };
}
