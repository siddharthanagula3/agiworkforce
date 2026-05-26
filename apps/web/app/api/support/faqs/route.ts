/**
 * GET /api/support/faqs — list all published FAQs.
 * Static data; no DB required.
 */

import { NextResponse } from 'next/server';
import { STATIC_FAQS } from '@/lib/support/static-data';

export async function GET() {
  const faqs = STATIC_FAQS.filter((f) => f.is_published).sort(
    (a, b) => a.display_order - b.display_order,
  );
  return NextResponse.json({ faqs });
}
