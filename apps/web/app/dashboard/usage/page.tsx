import { createSupabaseServerClient } from '../../../services/supabase-server';
import { redirect } from 'next/navigation';
import { DashboardLayout } from '../../../components/dashboard/DashboardLayout';
import { Card, CardContent } from '@/components/ui';
import { AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const activeStatuses = ['active', 'trialing'];
  const hasActiveSubscription = subscription && activeStatuses.includes(subscription.status);

  if (!hasActiveSubscription) {
    redirect('/pricing?reason=subscription_required');
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage & Limits</h1>
          <p className="text-zinc-400 mt-2">Monitor your API usage and limits.</p>
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <AlertCircle className="h-6 w-6 text-zinc-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No Usage Data Available</h3>
              <p className="text-zinc-400 max-w-md mx-auto">
                You haven&apos;t generated any usage data yet. Once you start using the desktop app,
                your metrics will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
