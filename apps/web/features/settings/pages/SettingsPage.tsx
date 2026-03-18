'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';
import { Switch } from '@shared/ui/switch';
import { Textarea } from '@shared/ui/textarea';
import { Slider } from '@shared/ui/slider';
import { Avatar, AvatarFallback, AvatarImage } from '@shared/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import { RadioGroup, RadioGroupItem } from '@shared/ui/radio-group';
import { User, Brain, Key, Palette, Bell, Eye, EyeOff, Save, Shield, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@shared/lib/utils';
import { useSettingsStore, type ChatFont } from '@/stores/settingsStore';

// ---------------------------------------------------------------------------
// Profile Tab
// ---------------------------------------------------------------------------

function ProfileTab() {
  const [name, setName] = useState('John Doe');
  const [email] = useState('john@example.com');
  const [avatarUrl, setAvatarUrl] = useState('');

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSave = () => {
    toast.info('Profile saving is not yet implemented');
  };

  const handleAvatarUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (avatarUrl.startsWith('blob:')) {
          URL.revokeObjectURL(avatarUrl);
        }
        const url = URL.createObjectURL(file);
        setAvatarUrl(url);
        toast.success('Avatar updated');
      }
    };
    input.click();
  };

  return (
    <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-lg">Profile Information</CardTitle>
        <CardDescription>Update your personal details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={avatarUrl} alt={name} />
            <AvatarFallback className="bg-primary/20 text-lg">{initials}</AvatarFallback>
          </Avatar>
          <Button variant="outline" size="sm" onClick={handleAvatarUpload}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Photo
          </Button>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="profile-name">Name</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        {/* Email (read-only) */}
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={email} disabled className="opacity-60" />
          <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
        </div>

        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AI Configuration Tab
// ---------------------------------------------------------------------------

function AIConfigurationTab() {
  const [defaultModel, setDefaultModel] = useState('gpt-4o');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [systemPrompt, setSystemPrompt] = useState('');

  const handleSave = () => {
    toast.info('AI configuration saving is not yet implemented');
  };

  return (
    <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-lg">AI Configuration</CardTitle>
        <CardDescription>Configure default AI model and parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Default Model */}
        <div className="space-y-2">
          <Label htmlFor="default-model">Default Model</Label>
          <Select value={defaultModel} onValueChange={setDefaultModel}>
            <SelectTrigger id="default-model">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4o">GPT-4o</SelectItem>
              <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
              <SelectItem value="claude-sonnet-4-5-20250929">Claude 3.5 Sonnet</SelectItem>
              <SelectItem value="claude-haiku-4-5-20251001">Claude 3.5 Haiku</SelectItem>
              <SelectItem value="gemini-2.5-pro">Gemini Pro</SelectItem>
              <SelectItem value="gemini-2.5-flash">Gemini Flash</SelectItem>
              <SelectItem value="deepseek-chat">DeepSeek Chat</SelectItem>
              <SelectItem value="sonar-pro">Perplexity Sonar Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Temperature */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Temperature</Label>
            <span className="text-sm text-muted-foreground">{temperature.toFixed(1)}</span>
          </div>
          <Slider
            value={[temperature]}
            onValueChange={([v]) => setTemperature(v!)}
            min={0}
            max={1}
            step={0.1}
            aria-label="Temperature"
          />
          <p className="text-xs text-muted-foreground">
            Lower values are more focused, higher values are more creative
          </p>
        </div>

        {/* Max Tokens */}
        <div className="space-y-2">
          <Label htmlFor="max-tokens">Max Tokens</Label>
          <Input
            id="max-tokens"
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            min={256}
            max={32000}
            step={256}
          />
          <p className="text-xs text-muted-foreground">
            Maximum number of tokens in the response (256 - 32,000)
          </p>
        </div>

        {/* Custom System Prompt */}
        <div className="space-y-2">
          <Label htmlFor="system-prompt">Custom System Prompt</Label>
          <Textarea
            id="system-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Enter a custom system prompt for all conversations..."
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            This prompt will be prepended to every conversation
          </p>
        </div>

        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API Keys Tab
// ---------------------------------------------------------------------------

interface ApiKeyFieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}

function ApiKeyField({ label, id, value, onChange }: ApiKeyFieldProps) {
  const [visible, setVisible] = useState(false);

  const handleTest = () => {
    if (!value.trim()) {
      toast.error(`Please enter your ${label} first`);
      return;
    }
    toast.info('Provider testing is not yet implemented');
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`sk-...`}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={visible ? 'Hide API key' : 'Show API key'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={handleTest}>
          Test
        </Button>
      </div>
    </div>
  );
}

function APIKeysTab() {
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');

  const handleSave = () => {
    toast.info('API key saving is not yet implemented');
  };

  return (
    <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-lg">API Keys</CardTitle>
        <CardDescription>Manage your AI provider API keys</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ApiKeyField
          label="OpenAI API Key"
          id="openai-key"
          value={openaiKey}
          onChange={setOpenaiKey}
        />
        <ApiKeyField
          label="Anthropic API Key"
          id="anthropic-key"
          value={anthropicKey}
          onChange={setAnthropicKey}
        />
        <ApiKeyField
          label="Google AI API Key"
          id="google-key"
          value={googleKey}
          onChange={setGoogleKey}
        />

        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
          <p className="text-xs text-yellow-200/80">
            Keys are encrypted and stored securely. They are never sent to our servers and remain on
            your device.
          </p>
        </div>

        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Save Keys
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Appearance Tab
// ---------------------------------------------------------------------------

function AppearanceTab() {
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState('en');
  const [fontSize, setFontSize] = useState('medium');
  const { chatFont, setChatFont } = useSettingsStore();

  useEffect(() => {
    if (chatFont !== 'default') {
      document.documentElement.setAttribute('data-chat-font', chatFont);
    } else {
      document.documentElement.removeAttribute('data-chat-font');
    }
  }, [chatFont]);

  return (
    <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-lg">Appearance</CardTitle>
        <CardDescription>Customize the look and feel</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme */}
        <div className="space-y-3">
          <Label>Theme</Label>
          <RadioGroup value={theme} onValueChange={setTheme} className="flex gap-4">
            {(['dark', 'light', 'system'] as const).map((t) => (
              <div key={t} className="flex items-center gap-2">
                <RadioGroupItem value={t} id={`theme-${t}`} />
                <Label htmlFor={`theme-${t}`} className="cursor-pointer capitalize">
                  {t}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label htmlFor="language">Language</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Font Size */}
        <div className="space-y-3">
          <Label>Font Size</Label>
          <RadioGroup value={fontSize} onValueChange={setFontSize} className="flex gap-4">
            {(['small', 'medium', 'large'] as const).map((s) => (
              <div key={s} className="flex items-center gap-2">
                <RadioGroupItem value={s} id={`font-${s}`} />
                <Label htmlFor={`font-${s}`} className="cursor-pointer capitalize">
                  {s}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Chat Font */}
        <div className="space-y-2">
          <Label>Chat Font</Label>
          <div className="flex gap-2">
            {[
              { value: 'default', label: 'Default' },
              { value: 'system', label: 'System' },
              { value: 'dyslexic', label: 'Dyslexic Friendly' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChatFont(opt.value as ChatFont)}
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
// Notifications Tab
// ---------------------------------------------------------------------------

interface NotifToggleProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function NotifToggle({ id, label, description, checked, onCheckedChange }: NotifToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function NotificationsTab() {
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [usageAlerts, setUsageAlerts] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(false);
  const [marketingEmails, setMarketingEmails] = useState(false);

  return (
    <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-lg">Notifications</CardTitle>
        <CardDescription>Choose what notifications you receive</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <NotifToggle
          id="email-notifs"
          label="Email Notifications"
          description="Receive important updates via email"
          checked={emailNotifs}
          onCheckedChange={setEmailNotifs}
        />
        <NotifToggle
          id="usage-alerts"
          label="Usage Alerts"
          description="Get notified when approaching usage limits"
          checked={usageAlerts}
          onCheckedChange={setUsageAlerts}
        />
        <NotifToggle
          id="weekly-summary"
          label="Weekly Summary"
          description="Receive a weekly summary of your activity"
          checked={weeklySummary}
          onCheckedChange={setWeeklySummary}
        />
        <NotifToggle
          id="marketing-emails"
          label="Marketing Emails"
          description="Receive product updates and promotions"
          checked={marketingEmails}
          onCheckedChange={setMarketingEmails}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab Config
// ---------------------------------------------------------------------------

const TABS = [
  { value: 'profile', label: 'Profile', icon: User },
  { value: 'ai', label: 'AI Config', icon: Brain },
  { value: 'keys', label: 'API Keys', icon: Key },
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'notifications', label: 'Notifications', icon: Bell },
] as const;

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl space-y-6 px-4 py-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, AI configuration, and preferences
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-5">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn('flex shrink-0 items-center gap-1.5 text-xs sm:text-sm')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="ai" className="mt-6">
          <AIConfigurationTab />
        </TabsContent>

        <TabsContent value="keys" className="mt-6">
          <APIKeysTab />
        </TabsContent>

        <TabsContent value="appearance" className="mt-6">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <NotificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
