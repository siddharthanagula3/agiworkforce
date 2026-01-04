import { createSupabaseServerClient } from '../../../services/supabase-server';
import { redirect } from 'next/navigation';
import { DashboardLayout } from '../../../components/dashboard/DashboardLayout';
import { Card, CardContent, CardTitle, CardHeader, CardDescription, Button } from '@/components/ui';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { ManageBillingButton } from '../../../components/stripe/ManageBillingButton';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  // Use maybeSingle() to avoid errors when no subscription exists (new users)
  // Free tier users can view billing page to see upgrade options
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const isSubscribed = subscription?.status === 'active' || subscription?.status === 'trialing';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Plans</h1>
          <p className="text-zinc-400 mt-2">Manage your subscription and payment details.</p>
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-200">Current Subscription</CardTitle>
            <CardDescription className="text-zinc-400">
              You are currently on the{' '}
              <span className="text-white font-semibold capitalize">
                {subscription?.plan_tier || 'Free'}
              </span>{' '}
              plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isSubscribed ? (
              <div className="bg-green-900/10 border border-green-900/20 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-green-500">Active Subscription</h4>
                  <p className="text-sm text-zinc-400 mt-1">
                    Your plan renews on{' '}
                    {subscription?.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : 'N/A'}
                    .
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-blue-900/10 border border-blue-900/20 rounded-lg p-4">
                <h4 className="font-semibold text-blue-400">No Active Subscription</h4>
                <p className="text-sm text-zinc-400 mt-1 mb-4">
                  Upgrade to a paid plan to unlock full automation capabilities.
                </p>
                <Link href="/pricing">
                  <Button>View Plans</Button>
                </Link>
              </div>
            )}

            {isSubscribed && (
              <div className="flex gap-4">
                <ManageBillingButton />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
