/**
 * GET /api/support/articles · list support articles.
 * Optionally filter by category_id via ?category=<id>.
 * Static data; no DB required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { STATIC_ARTICLES } from '@/lib/support/static-data';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');

  const articles = category
    ? STATIC_ARTICLES.filter((a) => a.category_id === category)
    : STATIC_ARTICLES;

  return NextResponse.json({ articles });
}
