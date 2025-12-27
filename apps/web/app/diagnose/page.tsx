import { createSupabaseServerClient } from '../../services/supabase-server';
import { redirect } from 'next/navigation';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export default async function DiagnosePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const checks = {
    env: {
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    },
    user: {
      id: session.user.id,
      email: session.user.email,
    },
    stripe: {
      connected: false,
      customersFound: 0,
      activeSubscriptions: 0,
      data: null as any,
    },
    supabase: {
      subscriptionFound: false,
      data: null as any,
    },
    serviceRole: {
      canConnect: false,
    },
  };

  // Check Supabase Service Role
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const content = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      );
      // Try a basic read
      const { error } = await content
        .from('subscriptions')
        .select('count', { count: 'exact', head: true });
      checks.serviceRole.canConnect = !error;
    }
  } catch (e) {
    checks.serviceRole.canConnect = false;
  }

  // Check Stripe
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
      });
      checks.stripe.connected = true;

      if (session.user.email) {
        const customers = await stripe.customers.list({ email: session.user.email, limit: 1 });
        checks.stripe.customersFound = customers.data.length;

        if (customers.data.length > 0) {
          const subs = await stripe.subscriptions.list({
            customer: customers.data[0].id,
            status: 'active',
          });
          checks.stripe.activeSubscriptions = subs.data.length;
          checks.stripe.data = subs.data.map((s) => ({
            id: s.id,
            status: s.status,
            plan_tier_meta: s.metadata?.plan_tier,
            price_id: s.items.data[0]?.price.id,
          }));
        }
      }
    } catch (e) {
      checks.stripe.connected = false;
    }
  }

  // Check Local Supabase
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  checks.supabase.subscriptionFound = !!sub;
  checks.supabase.data = sub;

  return (
    <div className="p-8 font-mono text-sm bg-black text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">System Diagnosis</h1>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-bold text-green-400 mb-2">Environment Variables</h2>
          <pre className="bg-zinc-900 p-4 rounded border border-zinc-800">
            {JSON.stringify(checks.env, null, 2)}
          </pre>
          {!checks.env.SUPABASE_SERVICE_ROLE_KEY && (
            <div className="mt-2 text-red-500 font-bold">
              CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing! Webhooks and Sync will fail.
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-bold text-blue-400 mb-2">Service Role Access</h2>
          <pre className="bg-zinc-900 p-4 rounded border border-zinc-800">
            {JSON.stringify(checks.serviceRole, null, 2)}
          </pre>
        </section>

        <section>
          <h2 className="text-xl font-bold text-purple-400 mb-2">Stripe Status</h2>
          <pre className="bg-zinc-900 p-4 rounded border border-zinc-800">
            {JSON.stringify(checks.stripe, null, 2)}
          </pre>
        </section>

        <section>
          <h2 className="text-xl font-bold text-orange-400 mb-2">Supabase (Local) Status</h2>
          <pre className="bg-zinc-900 p-4 rounded border border-zinc-800">
            {JSON.stringify(checks.supabase, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
