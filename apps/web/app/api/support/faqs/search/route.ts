/**
 * GET /api/support/faqs/search?q=<query> — search FAQs by keyword.
 * Static data; performs case-insensitive substring match on question and answer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { STATIC_FAQS } from '@/lib/support/static-data';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();

  if (!query) {
    // No query - return all published FAQs
    const faqs = STATIC_FAQS.filter((f) => f.is_published).sort(
      (a, b) => a.display_order - b.display_order,
    );
    return NextResponse.json({ faqs, query: '' });
  }

  const faqs = STATIC_FAQS.filter(
    (f) =>
      f.is_published &&
      (f.question.toLowerCase().includes(query) ||
        f.answer.toLowerCase().includes(query) ||
        f.category.toLowerCase().includes(query)),
  ).sort((a, b) => a.display_order - b.display_order);

  return NextResponse.json({ faqs, query });
}
