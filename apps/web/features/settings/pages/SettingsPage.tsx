'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@shared/ui/card';
import { Palette, MessageSquare, Server, Shield, Activity, Database } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { ChatSettings } from '@/components/settings/ChatSettings';
import { CustomModelsSettings } from '@/components/settings/CustomModelsSettings';
import { useSettingsStore, type ChatFont, type ResponseStyle } from '@/stores/settingsStore';
import { Button } from '@shared/ui/button';
import { toast } from 'sonner';
import { useAuthStore } from '@shared/stores/authentication-store';

// ---------------------------------------------------------------------------
// Appearance Tab
// ---------------------------------------------------------------------------

function AppearanceTab() {
  const { chatFont, setChatFont } = useSettingsStore();

  return (
    <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-lg">Appearance</CardTitle>
        <CardDescription>Customize the look and feel of the interface</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AppearanceSettings />

        {/* Chat Font */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Chat Font</label>
          <div className="flex gap-2">
            {(
              [
                { value: 'default', label: 'Default' },
                { value: 'system', label: 'System' },
                { value: 'dyslexic', label: 'Dyslexic Friendly' },
              ] as { value: ChatFont; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChatFont(opt.value)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm transition-colors',
                  chatFont === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted/60',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Dyslexic Friendly uses OpenDyslexic font for improved readability
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Response Style descriptions
// ---------------------------------------------------------------------------

const RESPONSE_STYLE_META: Record<ResponseStyle, string> = {
  concise: 'Short, direct responses',
  balanced: 'Clear and thorough',
  detailed: 'Comprehensive explanations',
  technical: 'Precise, code-focused',
};

// ---------------------------------------------------------------------------
// Chat Tab
// ---------------------------------------------------------------------------

function ChatTab() {
  const { responseStyle, setResponseStyle } = useSettingsStore();

  return (
    <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-lg">Chat</CardTitle>
        <CardDescription>Configure chat behavior and model defaults</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ChatSettings />

        {/* Response Style */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Response Style</h3>
          <div className="grid grid-cols-2 gap-2">
            {(['concise', 'balanced', 'detailed', 'technical'] as const).map((style) => (
              <button
                key={style}
                onClick={() => setResponseStyle(style)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  responseStyle === style
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <div className="font-medium capitalize">{style}</div>
                <div className="text-xs text-muted-foreground">{RESPONSE_STYLE_META[style]}</div>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Models Tab
// ---------------------------------------------------------------------------

function ModelsTab() {
  return (
    <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-lg">Custom Models</CardTitle>
        <CardDescription>
          Connect to additional LLM providers like Groq, Ollama, LM Studio, and more
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CustomModelsSettings />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Account Tab — Export Data + Delete Account
// ---------------------------------------------------------------------------

function AccountTab() {
  const { user } = useAuthStore();
  const [isExporting, setIsExporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  const handleExportData = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const res = await fetch('/api/user/export', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agiworkforce-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch {
      toast.error('Export failed. Please try again or contact support.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Account deletion initiated. You will receive a confirmation email.');
      setShowDeleteWarning(false);
      setDeleteConfirm('');
    } catch {
      toast.error('Account deletion failed. Please contact support@agiworkforce.com.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Export Data */}
      <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg">Export Your Data</CardTitle>
          <CardDescription>
            Download a copy of all your data: conversations, settings, agent history, and usage
            records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Your export will include all conversations, messages, settings, hired skills, and API
            usage history. The file is a JSON archive.
          </p>
          <Button
            onClick={handleExportData}
            disabled={isExporting}
            variant="outline"
            className="border-border"
          >
            {isExporting ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                Preparing export…
              </>
            ) : (
              'Export All Data'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Delete Account */}
      <Card className="border-red-500/20 bg-red-500/[0.03] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg text-red-400">Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showDeleteWarning ? (
            <Button
              variant="outline"
              className="border-red-500/40 text-red-400 hover:border-red-500/70 hover:bg-red-500/10"
              onClick={() => setShowDeleteWarning(true)}
            >
              Delete Account
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-sm font-medium text-red-400">This will permanently delete:</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>All conversations and messages</li>
                  <li>All agent tasks and history</li>
                  <li>All custom settings and preferences</li>
                  <li>Your subscription and billing history</li>
                </ul>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Type <span className="font-bold text-red-400">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="w-full rounded-md border border-red-500/40 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-red-500/70 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDeleteWarning(false);
                    setDeleteConfirm('');
                  }}
                  className="border-border"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={deleteConfirm !== 'DELETE' || isDeleting}
                  onClick={handleDeleteAccount}
                  className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting…' : 'Permanently Delete Account'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privacy & Data Tab — FIX-042 data residency + GDPR rights (FIX-041)
// ---------------------------------------------------------------------------

function PrivacyDataTab() {
  return (
    <div className="space-y-4">
      {/* Data Residency */}
      <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            Data Residency
          </CardTitle>
          <CardDescription>Where your data is stored</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <p>
              <span className="font-medium text-foreground">Cloud Mode:</span> Conversations and
              settings are stored in{' '}
              <span className="font-medium text-foreground">
                Supabase (AWS us-east-2 · Ohio, USA)
              </span>
              .
            </p>
            <p>
              <span className="font-medium text-foreground">Local Mode:</span> All data stays on
              your device. Nothing is transmitted to our servers.
            </p>
          </div>
          <p className="text-xs">
            <span className="font-medium text-amber-400">EU Residents:</span> We do not currently
            offer EU-region data storage. If you require data to remain within the EEA, use Local
            Mode until an EU region is available.{' '}
            <a href="/privacy#7" className="text-blue-400 hover:underline">
              Learn more in our Privacy Policy.
            </a>
          </p>
        </CardContent>
      </Card>

      {/* GDPR / CCPA rights + Export + Delete */}
      <AccountTab />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TABS = [
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'chat', label: 'Chat', icon: MessageSquare },
  { value: 'models', label: 'Models', icon: Server },
  { value: 'privacy', label: 'Privacy & Data', icon: Shield },
] as const;

type TabValue = (typeof TABS)[number]['value'];

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabValue>('appearance');

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl space-y-6 px-4 py-4 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Customize appearance, chat preferences, and model endpoints
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="hidden items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground sm:flex"
          onClick={() => router.push('/chat')}
        >
          <Activity className="h-3.5 w-3.5" />
          System Status
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="grid w-full grid-cols-4 text-xs sm:text-sm">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center gap-1.5 text-xs sm:text-sm"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="appearance" className="mt-6">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="chat" className="mt-6">
          <ChatTab />
        </TabsContent>

        <TabsContent value="models" className="mt-6">
          <ModelsTab />
        </TabsContent>

        <TabsContent value="privacy" className="mt-6">
          <PrivacyDataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
