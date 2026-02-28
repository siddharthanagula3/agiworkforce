import { createSupabaseServerClient } from '../../../services/supabase-server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui';
import { Zap, TrendingUp, Calendar, Clock, AlertCircle, CheckCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

// Plan tier credit allocations (in cents) - matches PRICING_CONFIG
const PLAN_CREDITS: Record<string, number> = {
  free: 0,
  hobby: 350, // $3.50
  pro: 1050, // $10.50
  max: 10500, // $105.00
  enterprise: 52500, // $525.00
};

function formatCurrency(cents: number): string {
  return cents.toString();
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDaysRemaining(periodEnd: string | null): number {
  if (!periodEnd) return 0;
  const now = new Date();
  const end = new Date(periodEnd);
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getProgressColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 70) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

export default async function UsagePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  // Fetch subscription details
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id, status, plan_tier, current_period_start, current_period_end')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const activeStatuses = ['active', 'trialing'];
  const hasActiveSubscription = subscription && activeStatuses.includes(subscription.status);

  if (!hasActiveSubscription) {
    redirect('/pricing?reason=subscription_required');
  }

  // Fetch credit balance
  const { data: creditBalance } = await supabase.rpc('get_credit_balance', {
    p_user_id: session.user.id,
  });

  // Fetch recent credit transactions
  const { data: recentTransactions } = await supabase
    .from('credit_transactions')
    .select('id, transaction_type, amount_cents, description, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Calculate usage metrics
  const allocatedCents =
    creditBalance?.[0]?.credits_allocated_cents ?? PLAN_CREDITS[subscription.plan_tier] ?? 0;
  const usedCents = creditBalance?.[0]?.credits_used_cents ?? 0;
  const remainingCents = creditBalance?.[0]?.credits_remaining_cents ?? allocatedCents;
  const dailyLimitCents = creditBalance?.[0]?.daily_limit_cents ?? Math.floor(allocatedCents * 0.3);
  const dailyUsedCents = creditBalance?.[0]?.daily_used_cents ?? 0;
  const dailyRemainingCents = creditBalance?.[0]?.daily_remaining_cents ?? dailyLimitCents;

  const monthlyPercentage = allocatedCents > 0 ? Math.round((usedCents / allocatedCents) * 100) : 0;
  const dailyPercentage =
    dailyLimitCents > 0 ? Math.round((dailyUsedCents / dailyLimitCents) * 100) : 0;
  const daysRemaining = getDaysRemaining(subscription.current_period_end);

  const hasUsageData = allocatedCents > 0;

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usage & Credits</h1>
        <p className="text-zinc-400 mt-2">
          Monitor your API credit usage and limits for your{' '}
          {subscription.plan_tier.charAt(0).toUpperCase() + subscription.plan_tier.slice(1)} plan.
        </p>
      </div>

      {!hasUsageData ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <AlertCircle className="h-6 w-6 text-zinc-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Credits Not Yet Allocated</h3>
              <p className="text-zinc-400 max-w-md mx-auto">
                Your credits will be allocated when your subscription period starts. Once you start
                using the desktop app, your usage will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Credit Overview Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Monthly Credits</CardTitle>
                <Zap className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {formatCurrency(remainingCents)}
                </div>
                <p className="text-xs text-zinc-500">
                  of {formatCurrency(allocatedCents)} remaining
                </p>
                <div className="mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getProgressColor(monthlyPercentage)} transition-all`}
                    style={{ width: `${monthlyPercentage}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">{monthlyPercentage}% used</p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Daily Limit</CardTitle>
                <Clock className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {formatCurrency(dailyRemainingCents)}
                </div>
                <p className="text-xs text-zinc-500">
                  of {formatCurrency(dailyLimitCents)} remaining today
                </p>
                <div className="mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getProgressColor(dailyPercentage)} transition-all`}
                    style={{ width: `${dailyPercentage}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">{dailyPercentage}% used (resets daily)</p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">
                  Used This Period
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatCurrency(usedCents)}</div>
                <p className="text-xs text-zinc-500">total credits consumed</p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Billing Period</CardTitle>
                <Calendar className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{daysRemaining} days</div>
                <p className="text-xs text-zinc-500">
                  until {formatDate(subscription.current_period_end)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-200">Recent Activity</CardTitle>
              <CardDescription className="text-zinc-400">
                Your latest credit transactions and usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentTransactions && recentTransactions.length > 0 ? (
                <div className="space-y-3">
                  {recentTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            tx.transaction_type === 'allocation' || tx.transaction_type === 'reset'
                              ? 'bg-emerald-500/10'
                              : tx.transaction_type === 'deduction'
                                ? 'bg-red-500/10'
                                : 'bg-blue-500/10'
                          }`}
                        >
                          {tx.transaction_type === 'allocation' ||
                          tx.transaction_type === 'reset' ? (
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                          ) : tx.transaction_type === 'deduction' ? (
                            <Zap className="h-4 w-4 text-red-500" />
                          ) : (
                            <TrendingUp className="h-4 w-4 text-blue-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {tx.transaction_type === 'allocation'
                              ? 'Credits Allocated'
                              : tx.transaction_type === 'reset'
                                ? 'Credits Reset'
                                : tx.transaction_type === 'deduction'
                                  ? 'Credits Used'
                                  : tx.transaction_type === 'refund'
                                    ? 'Credits Refunded'
                                    : tx.transaction_type}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {tx.description || formatDate(tx.created_at)}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`text-sm font-medium ${
                          tx.transaction_type === 'deduction' ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {tx.transaction_type === 'deduction' ? '-' : '+'}
                        {formatCurrency(tx.amount_cents)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-zinc-500">
                    No transactions yet. Start using the desktop app to see your usage history.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage Tips */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-200">Usage Tips</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#x2022;</span>
                  <span>
                    Daily limits (30% of monthly) prevent accidental overuse and ensure credits last
                    the month
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#x2022;</span>
                  <span>
                    Credits reset at the start of each billing period - unused credits don&apos;t
                    roll over
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#x2022;</span>
                  <span>
                    Need more credits? Upgrade your plan in the billing section for higher limits
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
