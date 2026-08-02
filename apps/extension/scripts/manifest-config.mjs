import { Buffer } from 'node:buffer';
import { createPublicKey } from 'node:crypto';

function normalizeChromeExtensionPublicKey(value) {
  const publicKey = value?.trim();
  if (!publicKey) return undefined;

  const isCanonicalBase64 =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(publicKey);
  if (!isCanonicalBase64) {
    throw new Error(
      'CHROME_EXTENSION_PUBLIC_KEY must be the single-line base64 DER public key from the Chrome Web Store dashboard.',
    );
  }

  try {
    const decoded = Buffer.from(publicKey, 'base64');
    const parsed = createPublicKey({ key: decoded, format: 'der', type: 'spki' });
    const canonicalDer = parsed.export({ format: 'der', type: 'spki' });
    if (parsed.asymmetricKeyType !== 'rsa' || !Buffer.from(canonicalDer).equals(decoded)) {
      throw new Error('not a canonical RSA SPKI public key');
    }
  } catch {
    throw new Error(
      'CHROME_EXTENSION_PUBLIC_KEY must be the single-line base64 DER RSA public key from the Chrome Web Store dashboard.',
    );
  }

  return publicKey;
}

function validateLiveClerkPublishableKey(value, frontendApi) {
  const publishableKey = value?.trim();
  const prefix = 'pk_live_';
  const encodedFrontendApi = publishableKey?.startsWith(prefix)
    ? publishableKey.slice(prefix.length)
    : '';
  if (!encodedFrontendApi || !/^[A-Za-z0-9+/]+$/u.test(encodedFrontendApi)) {
    throw new Error('A valid live CLERK_PUBLISHABLE_KEY is required for a production package.');
  }

  try {
    const decodedBytes = Buffer.from(encodedFrontendApi, 'base64');
    const canonicalBase64 = decodedBytes.toString('base64').replace(/=+$/u, '');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(decodedBytes);
    if (
      canonicalBase64 !== encodedFrontendApi ||
      !decoded.endsWith('$') ||
      decoded.slice(0, -1).includes('$')
    ) {
      throw new Error('invalid Clerk publishable-key encoding');
    }

    const encodedOrigin = normalizeOrigin(
      `https://${decoded.slice(0, -1)}`,
      'CLERK_PUBLISHABLE_KEY Frontend API',
    );
    if (encodedOrigin !== frontendApi) {
      throw new Error('publishable key does not match configured Frontend API');
    }
  } catch {
    throw new Error(
      'CLERK_PUBLISHABLE_KEY must be a valid live key for the configured CLERK_FRONTEND_API.',
    );
  }
}

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

  const publicKey = normalizeChromeExtensionPublicKey(configuration.chromeExtensionPublicKey);
  if (publicKey) manifest.key = publicKey;
  return manifest;
}

export function validateReleaseManifest(manifest, configuration) {
  const frontendApi = normalizeOrigin(configuration.clerkFrontendApi, 'CLERK_FRONTEND_API');
  const syncHost = normalizeOrigin(configuration.clerkSyncHost, 'CLERK_SYNC_HOST');
  if (!frontendApi) throw new Error('CLERK_FRONTEND_API is required for a production package.');
  if (!syncHost) throw new Error('CLERK_SYNC_HOST is required for a production package.');
  validateLiveClerkPublishableKey(configuration.clerkPublishableKey, frontendApi);
  const publicKey = normalizeChromeExtensionPublicKey(configuration.chromeExtensionPublicKey);
  if (!publicKey) {
    throw new Error(
      'CHROME_EXTENSION_PUBLIC_KEY is required so the production CRX ID remains stable.',
    );
  }
  if (manifest.key !== publicKey) {
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

export function resolveChromeBuildConfiguration(fileEnvironment, processEnvironment) {
  return readChromeBuildConfiguration({ ...fileEnvironment, ...processEnvironment });
}
