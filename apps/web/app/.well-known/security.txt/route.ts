import { CONTACT_EMAIL } from '@/lib/legal-constants';
import { SITE_URL } from '@/lib/seo/site';

/**
 * RFC 9116 `security.txt`.
 *
 * Enterprise security questionnaires ask for this file by name, and a
 * researcher who finds a bug looks here before looking anywhere else. Every
 * value below mirrors the coordinated-disclosure section published at
 * `/security#report` — if you change one, change both.
 *
 * `Expires` is required by RFC 9116 §2.5.5 and must be a future timestamp. It is
 * computed as 90 days out rather than hardcoded so that the file cannot quietly
 * go stale the way a checked-in date would; §2.5.5 recommends a value less than
 * a year in the future, which this satisfies. `dynamic = 'force-dynamic'` keeps
 * the timestamp from being frozen into a build artifact.
 *
 * Deliberately absent: `Encryption`. We publish no PGP key today, and pointing at
 * a key that does not exist is worse than omitting the field.
 */

export const dynamic = 'force-dynamic';

const EXPIRY_DAYS = 90;

export function GET(): Response {
  const expires = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const body = [
    '# Coordinated vulnerability disclosure for AGI Workforce.',
    '# Full policy, including scope, safe harbour and response targets:',
    `# ${SITE_URL}/security#report`,
    '',
    `Contact: mailto:${CONTACT_EMAIL}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    `Policy: ${SITE_URL}/security#report`,
    `Acknowledgments: ${SITE_URL}/changelog`,
    '',
    '# Put "security" in the subject line. Include the affected surface, the',
    '# version or URL, steps to reproduce, and what an attacker gains.',
    '# There is no paid bounty programme. We will credit you by name if you want it.',
    '',
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
