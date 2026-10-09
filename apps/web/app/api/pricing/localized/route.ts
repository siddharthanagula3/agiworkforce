import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { LocalizedPricingCatalog as LocalizedPricingCatalogBody } from '@agiworkforce/cloud-contracts';
import { getLocalizedPricingCatalog } from '@/lib/server/localized-pricing-service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const country = request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() || 'US';
  const catalog: LocalizedPricingCatalogBody = await getLocalizedPricingCatalog(country);

  return NextResponse.json(catalog, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      Vary: 'X-Vercel-IP-Country',
    },
  });
}
