import { createSupabaseServerClient } from '../../../services/supabase-server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card, CardContent, CardTitle, CardHeader, CardDescription, Button } from '@/components/ui';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ManageBillingButton } from '../../../components/stripe/ManageBillingButton';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import BillingDashboardClient from './BillingDashboardClient';

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
    <ErrorBoundary componentName="BillingPage" compact>
      <div className="space-y-6 py-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Plans</h1>
          <p className="text-muted-foreground mt-2">
            Manage your subscription and payment details.
          </p>
        </div>

        <Card className="glass-strong">
          <CardHeader>
            <CardTitle>Current Subscription</CardTitle>
            <CardDescription>
              You are currently on the{' '}
              <span className="text-foreground font-semibold capitalize">
                {subscription?.plan_tier || 'Free'}
              </span>{' '}
              plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isSubscribed ? (
              <div className="bg-success/10 border border-success/20 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                <div>
                  <h4 className="font-semibold text-success">Active Subscription</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your plan renews on{' '}
                    {subscription?.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : 'N/A'}
                    .
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                <h4 className="font-semibold text-primary">No Active Subscription</h4>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Upgrade to a paid plan to unlock full automation capabilities.
                </p>
                <Link href="/pricing">
                  <Button className="gradient-primary text-white">View Plans</Button>
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

        {/* Detailed Billing Dashboard — token usage, per-LLM breakdown, invoices */}
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          }
        >
          <BillingDashboardClient />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
