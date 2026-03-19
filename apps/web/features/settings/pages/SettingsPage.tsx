'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@shared/ui/card';
import { Palette, MessageSquare } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { ChatSettings } from '@/components/settings/ChatSettings';
import { useSettingsStore, type ChatFont, type ResponseStyle } from '@/stores/settingsStore';

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
// Tab config
// ---------------------------------------------------------------------------

const TABS = [
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'chat', label: 'Chat', icon: MessageSquare },
] as const;

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'appearance' | 'chat'>('appearance');

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl space-y-6 px-4 py-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Customize appearance and chat preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-2">
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
      </Tabs>
    </div>
  );
}
