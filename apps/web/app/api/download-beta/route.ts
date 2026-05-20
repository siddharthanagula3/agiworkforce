import 'server-only';

import { readFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';

const DOWNLOAD_INFO: Record<string, { filename: string; contentType: string; envVar: string }> = {
  mac: {
    filename: 'AGI-Workforce.dmg',
    contentType: 'application/x-apple-diskimage',
    envVar: 'NEXT_PUBLIC_DOWNLOAD_URL_MAC',
  },
  windows: {
    filename: 'AGI-Workforce-Setup.exe',
    contentType: 'application/x-msdownload',
    envVar: 'NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS',
  },
  linux: {
    filename: 'AGI-Workforce.AppImage',
    contentType: 'application/x-executable',
    envVar: 'NEXT_PUBLIC_DOWNLOAD_URL_LINUX',
  },
};

const FILE_PATHS: Record<string, string> = {
  mac: 'agiworkforce.dmg',
  windows: 'agi-workforce-win.exe',
  linux: 'agi-workforce-linux.AppImage',
};

/**
 * FIX (audit 2026-05-20, §3 — open-redirect): externalUrl flows from
 * `process.env[info.envVar]` straight into `NextResponse.redirect`. The
 * pre-fix code's only check was `!externalUrl.startsWith('/')`, which is a
 * loose "not a same-site relative path" test — any absolute URL would be
 * accepted as a 307 redirect target, including attacker-controlled hosts
 * if env-var control were ever achievable (CI compromise, supply-chain,
 * misconfigured staging).
 *
 * Lock externalUrl down to our own download host + the GitHub releases
 * CDN. Any other host returns 400 so the operator can see the misconfig
 * immediately rather than discover it from a phishing report.
 *
 * FIX (Codex P2, 2026-05-20): pin GitHub redirects to the trusted owner+
 * repo pair, not just the path *shape*. Without this, an env-var
 * compromise could point at github.com/<attacker>/<fork>/releases/...
 * and still pass the gate.
 */
const EXTERNAL_URL_ALLOWED_HOSTS = new Set<string>([
  'downloads.agiworkforce.com',
  'cdn.agiworkforce.com',
  'github.com',
  'objects.githubusercontent.com', // GitHub release-asset CDN (signed URLs)
]);

const TRUSTED_GITHUB_RELEASES: ReadonlyArray<{ owner: string; repo: string }> = [
  { owner: 'siddharthanagula3', repo: 'agiworkforce' },
];

function isExternalRedirectAllowed(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  // Reject anything that isn't HTTPS. Plaintext download links downgrade
  // installer integrity even if they hit a known host.
  if (parsed.protocol !== 'https:') return false;
  if (!EXTERNAL_URL_ALLOWED_HOSTS.has(parsed.hostname)) return false;
  // For github.com, only allow /<trusted-owner>/<trusted-repo>/releases/*
  // — not a generic GitHub redirect.
  if (parsed.hostname === 'github.com') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 4) return false;
    const [owner, repo, kind] = segments;
    if (kind !== 'releases') return false;
    const ownerLower = owner?.toLowerCase() ?? '';
    const repoLower = repo?.toLowerCase() ?? '';
    const matched = TRUSTED_GITHUB_RELEASES.some(
      (pair) => pair.owner.toLowerCase() === ownerLower && pair.repo.toLowerCase() === repoLower,
    );
    if (!matched) return false;
  }
  return true;
}

async function handleDownloadBeta(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'download-beta');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'mac';

  if (!['mac', 'windows', 'linux'].includes(platform)) {
    throw createError.validation('Invalid platform. Must be mac, windows, or linux.');
  }

  // FIX (audit 2026-05-20, §13): assert the FILE_PATHS row exists right
  // after platform validation so a silently-drifted DOWNLOAD_INFO /
  // FILE_PATHS pair fails closed as 404 instead of `undefined`-pathing
  // through `path.join(...)` and returning a confusing 500.
  const info = DOWNLOAD_INFO[platform];
  const filePlatformPath = FILE_PATHS[platform];
  if (!info || !filePlatformPath) {
    throw createError.notFound(`Download for platform "${platform}" is not configured.`);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw createError.unauthorized('Authentication required to download.');
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();

  const activeStatuses = ['active', 'trialing'];
  const hasActiveSubscription = subscription && activeStatuses.includes(subscription.status);

  if (!hasActiveSubscription) {
    throw createError.forbidden('Active subscription required to download.');
  }

  const externalUrl = process.env[info.envVar];

  if (externalUrl && !externalUrl.startsWith('/')) {
    // FIX (audit 2026-05-20, §3): domain-pin the externalUrl before
    // handing it to NextResponse.redirect. Anything off-allowlist returns
    // a 400 so the operator sees the misconfig rather than the user
    // landing on a phishing page.
    if (!isExternalRedirectAllowed(externalUrl)) {
      throw createError.validation(
        'Download redirect target is not on the allowlist. ' +
          'Set NEXT_PUBLIC_DOWNLOAD_URL_* to an https URL on our own download host or a github.com release.',
      );
    }
    return NextResponse.redirect(externalUrl, { status: 307 });
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'downloads', filePlatformPath);
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': info.contentType,
        'Content-Disposition': `attachment; filename="${info.filename}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    throw createError.notFound(`Download for ${platform} is currently unavailable.`);
  }
}

export const GET = withErrorHandler(handleDownloadBeta);
