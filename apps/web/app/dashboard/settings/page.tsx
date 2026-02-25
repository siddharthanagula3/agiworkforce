import { createSupabaseServerClient } from '../../../services/supabase-server';
import { redirect } from 'next/navigation';
import { DashboardLayout } from '../../../components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from '@/components/ui';
import Link from 'next/link';
import { User, CreditCard, Palette, MessageSquare } from 'lucide-react';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { ChatSettings } from '@/components/settings/ChatSettings';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-zinc-400 mt-2">Manage your account preferences and settings.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-200 flex items-center gap-2">
                <User className="h-5 w-5" />
                Account
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Manage your personal details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-zinc-400">Email</label>
                  <p className="text-zinc-200">{session.user.email}</p>
                </div>
                <div className="pt-2">
                  <p className="text-sm text-zinc-500 italic">
                    Account details are managed via Supabase Auth.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-200 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Billing
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Manage your subscription and payments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-400 mb-4">
                View your current plan, update payment methods, and download invoices.
              </p>
              <Link href="/dashboard/billing">
                <Button variant="outline">Go to Billing</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Appearance settings */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-200 flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Appearance
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Customize the look and feel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AppearanceSettings />
          </CardContent>
        </Card>

        {/* Chat settings */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-200 flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Chat
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Configure your default model and chat behavior.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChatSettings />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
