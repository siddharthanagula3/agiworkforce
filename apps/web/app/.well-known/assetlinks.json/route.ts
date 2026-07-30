import { androidAssetLinksResponse } from '@/lib/server/mobile-app-association';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return androidAssetLinksResponse();
}
