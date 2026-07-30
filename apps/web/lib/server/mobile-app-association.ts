const IOS_APPLICATION_IDENTIFIER = 'D2PR62RLT4.com.agiworkforce.app';
const ANDROID_PACKAGE_NAME = 'com.agiworkforce.app';

const ASSOCIATION_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=300',
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
} as const;

const UNAVAILABLE_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function appleAppSiteAssociationResponse(): Response {
  return Response.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [IOS_APPLICATION_IDENTIFIER],
            components: [
              {
                '/': '/pair',
                comment: 'Desktop companion pairing code supplied in the query string.',
              },
              {
                '/': '/pair/*',
                comment: 'Desktop companion pairing code supplied as one path segment.',
              },
              {
                '/': '/auth/reset-password',
                comment: 'Clerk account recovery handoff.',
              },
            ],
          },
        ],
      },
    },
    { headers: ASSOCIATION_HEADERS },
  );
}

function normalizeSha256Fingerprint(value: string): string | undefined {
  const hex = value.replaceAll(':', '').trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/u.test(hex)) return undefined;
  return hex.match(/.{2}/gu)?.join(':');
}

export function configuredAndroidAppLinkFingerprints(
  raw = process.env['ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS'],
): string[] | undefined {
  if (raw === undefined || raw.trim().length === 0) return undefined;

  const normalized = raw
    .split(/[\n,]+/u)
    .map((value) => normalizeSha256Fingerprint(value))
    .filter((value): value is string => value !== undefined);
  const suppliedCount = raw.split(/[\n,]+/u).filter((value) => value.trim().length > 0).length;
  if (normalized.length !== suppliedCount || normalized.length === 0) return undefined;
  return [...new Set(normalized)];
}

export function androidAssetLinksResponse(): Response {
  const fingerprints = configuredAndroidAppLinkFingerprints();
  if (fingerprints === undefined) {
    return Response.json(
      {
        error: 'android_app_links_not_configured',
        message:
          'Set ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS to the Play App Signing SHA-256 certificate fingerprint.',
      },
      { status: 503, headers: UNAVAILABLE_HEADERS },
    );
  }

  return Response.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE_NAME,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: ASSOCIATION_HEADERS },
  );
}
