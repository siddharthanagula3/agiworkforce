import { OG_IMAGE } from '@/lib/seo/site';

export function GET(): Response {
  return new Response(null, { status: 308, headers: { Location: OG_IMAGE.url } });
}
