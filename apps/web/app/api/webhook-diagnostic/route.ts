import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET() {
  const headersList = await headers();
  const host = headersList.get('host') || 'unknown';

  // Check environment configuration (DO NOT expose actual keys)
  const config = {
    environment: process.env.NODE_ENV,
    host,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasStripeWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT_SET',
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(config);
}
