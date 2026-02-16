import { createSupabaseServerClient } from '../../services/supabase-server';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { CreditService } from '@/lib/services/credit-service';
import { redirect } from 'next/navigation';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { CreditMonitor } from '../../components/dashboard/CreditMonitor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { CreditCard, Download, Users, Zap } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  // Fetch subscription data with no-store cache for dynamic data
  // This ensures fresh data on every request (similar to getServerSideProps)
  // Use maybeSingle() to avoid errors when no subscription exists (new users)
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  // Allow free tier users to access the dashboard
  // Only sync with Stripe if they have a subscription record but it appears inactive
  let effectiveSubscription = subscription;

  if (subscription && !['active', 'trialing'].includes(subscription.status)) {
    // Attempt self-healing sync for inactive subscriptions
    if (session.user.email) {
      try {
        const syncedSub = await SubscriptionService.syncWithStripe(
          session.user.id,
          session.user.email,
        );
        if (syncedSub) {
          effectiveSubscription = syncedSub;
        }
      } catch (error) {
        console.error('Failed to sync subscription with Stripe:', error);
        // Continue with existing subscription data
      }
    }
  }

  // Fetch credit balance
  let creditBalance = null;
  let creditUsagePercentage = 0;
  try {
    const balance = await CreditService.getBalance(session.user.id);
    // Only set creditBalance if there's an actual account (account_id is not null)
    if (balance && balance.account_id) {
      creditBalance = balance;
      if (creditBalance.credits_allocated_cents > 0) {
        creditUsagePercentage =
          ((creditBalance.credits_allocated_cents - creditBalance.credits_remaining_cents) /
            creditBalance.credits_allocated_cents) *
          100;
      }
    }
  } catch (error) {
    console.error('Failed to fetch credit balance:', error);
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/download"
            className="bg-white text-black px-4 py-2 rounded-full font-medium text-sm hover:bg-zinc-200 transition-colors"
          >
            Download App
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-200">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white capitalize">
              {effectiveSubscription?.plan_tier || 'Free'}
            </div>
            <p className="text-xs text-zinc-500">
              {['active', 'trialing'].includes(effectiveSubscription?.status || '')
                ? 'Active subscription'
                : 'Free tier'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-200">Credit Usage</CardTitle>
            <Zap className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            {creditBalance ? (
              <>
                <div className="text-2xl font-bold text-white">
                  {creditBalance.credits_allocated_cents - creditBalance.credits_remaining_cents}
                </div>
                <p className="text-xs text-zinc-500 mb-2">
                  of {creditBalance.credits_allocated_cents} used
                </p>
                <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      creditUsagePercentage >= 100
                        ? 'bg-red-500'
                        : creditUsagePercentage >= 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(creditUsagePercentage, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {creditUsagePercentage.toFixed(1)}% used this period
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-white">$0.00</div>
                <p className="text-xs text-zinc-500">No active subscription</p>
              </>
            )}
          </CardContent>
        </Card>

        {}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-200">Team Members</CardTitle>
            <Users className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">1</div>
            <p className="text-xs text-zinc-500">Active users</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-200">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <Link
                href="/download"
                className="block p-4 rounded-lg border border-zinc-800 hover:bg-zinc-800 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <Download className="h-5 w-5" />
                  </div>
                  <span className="font-semibold text-zinc-200">Download App</span>
                </div>
                <p className="text-sm text-zinc-400">
                  Get the desktop agent for macOS, Windows, or Linux.
                </p>
              </Link>
              <Link
                href="/dashboard/billing"
                className="block p-4 rounded-lg border border-zinc-800 hover:bg-zinc-800 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-purple-500/10 text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <span className="font-semibold text-zinc-200">Manage Billing</span>
                </div>
                <p className="text-sm text-zinc-400">
                  Update payment methods, view invoices, or change plans.
                </p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credit monitoring and alert modal */}
      {creditBalance && (
        <CreditMonitor
          userId={session.user.id}
          currentPlan={effectiveSubscription?.plan_tier || 'free'}
          remainingCents={creditBalance.credits_remaining_cents}
          allocatedCents={creditBalance.credits_allocated_cents}
          usagePercentage={creditUsagePercentage}
        />
      )}
    </DashboardLayout>
  );
}
