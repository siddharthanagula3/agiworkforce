import { appleAppSiteAssociationResponse } from '@/lib/server/mobile-app-association';

export const revalidate = 300;

export function GET(): Response {
  return appleAppSiteAssociationResponse();
}
