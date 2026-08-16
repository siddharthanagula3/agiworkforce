import { CONTACT_EMAIL } from '@/lib/legal-constants';
import { SITE_URL } from '@/lib/seo/site';

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
