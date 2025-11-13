/**
 * Quick Setup Component
 * Fast configuration of essential settings before starting
 */

import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/Label';
import { Switch } from '../ui/Switch';
import { Badge } from '../ui/Badge';
import { Check, Zap, Shield, Bell, Sparkles } from 'lucide-react';
import type { OnboardingSettings } from '../../types/onboarding';

interface QuickSetupProps {
  initialSettings: OnboardingSettings;
  onComplete: (settings: OnboardingSettings) => void;
}

export const QuickSetup: React.FC<QuickSetupProps> = ({
  initialSettings,
  onComplete,
}) => {
  const [settings, setSettings] = useState<OnboardingSettings>(initialSettings);

  const handleProviderSelect = (provider: OnboardingSettings['llmProvider']) => {
    setSettings((prev) => ({ ...prev, llmProvider: provider }));
  };

  const handleToggle = (key: keyof Omit<OnboardingSettings, 'llmProvider'>) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleComplete = () => {
    onComplete(settings);
  };

  const providerOptions = [
    {
      id: 'ollama' as const,
      name: 'Ollama (Local)',
      description: 'Free, runs on your computer',
      icon: '🦙',
      recommended: true,
      pros: ['100% Free', 'Privacy-first', 'No API key needed'],
      badge: 'Recommended',
    },
    {
      id: 'openai' as const,
      name: 'OpenAI',
      description: 'GPT-4 and GPT-3.5',
      icon: '🤖',
      recommended: false,
      pros: ['Most capable', 'Fast responses', 'Great for complex tasks'],
      badge: null,
    },
    {
      id: 'anthropic' as const,
      name: 'Anthropic',
      description: 'Claude 3.5 Sonnet',
      icon: '🧠',
      recommended: false,
      pros: ['Excellent reasoning', 'Long context', 'Safe and reliable'],
      badge: null,
    },
    {
      id: 'google' as const,
      name: 'Google',
      description: 'Gemini 1.5 Pro',
      icon: '✨',
      recommended: false,
      pros: ['Multimodal', 'Fast', 'Good value'],
      badge: null,
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 py-8 px-4">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center">
          <div className="bg-primary/10 rounded-full p-3">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 className="text-4xl font-bold tracking-tight">
          You're Almost Ready!
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Quick setup to optimize your experience
        </p>
      </div>

      {/* LLM Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Choose Your AI Provider
          </CardTitle>
          <CardDescription>
            Select which AI model to use. You can change this anytime in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {providerOptions.map((provider) => {
              const isSelected = settings.llmProvider === provider.id;

              return (
                <Card
                  key={provider.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'border-primary border-2 shadow-md'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => handleProviderSelect(provider.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        {/* Icon */}
                        <div className="text-3xl">{provider.icon}</div>

                        {/* Info */}
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{provider.name}</h3>
                            {provider.recommended && (
                              <Badge
                                variant="default"
                                className="bg-gradient-to-r from-green-500 to-emerald-500 border-none"
                              >
                                {provider.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {provider.description}
                          </p>

                          {/* Pros */}
                          <div className="flex flex-wrap gap-2 pt-2">
                            {provider.pros.map((pro, index) => (
                              <Badge
                                key={index}
                                variant="secondary"
                                className="text-xs"
                              >
                                ✓ {pro}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Selection indicator */}
                      <div className="flex-shrink-0">
                        {isSelected ? (
                          <div className="bg-primary rounded-full p-1">
                            <Check className="h-4 w-4 text-primary-foreground" />
                          </div>
                        ) : (
                          <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Preferences
          </CardTitle>
          <CardDescription>
            Customize how AGI Workforce works for you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Notifications */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border">
            <div className="flex items-start gap-3 flex-1">
              <Bell className="h-5 w-5 text-muted-foreground mt-1" />
              <div className="space-y-1">
                <Label htmlFor="notifications" className="text-base font-semibold">
                  Enable Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when tasks complete or require your attention
                </p>
              </div>
            </div>
            <Switch
              id="notifications"
              checked={settings.notificationsEnabled}
              onCheckedChange={() => handleToggle('notificationsEnabled')}
            />
          </div>

          {/* Auto-approve */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border">
            <div className="flex items-start gap-3 flex-1">
              <Zap className="h-5 w-5 text-muted-foreground mt-1" />
              <div className="space-y-1">
                <Label htmlFor="auto-approve" className="text-base font-semibold">
                  Auto-Approve Safe Actions
                </Label>
                <p className="text-sm text-muted-foreground">
                  Let AGI Workforce run safe, non-destructive actions automatically
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="secondary" className="text-xs">
                    Reading files
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Web searches
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    API calls
                  </Badge>
                </div>
              </div>
            </div>
            <Switch
              id="auto-approve"
              checked={settings.autoApproveEnabled}
              onCheckedChange={() => handleToggle('autoApproveEnabled')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Check className="h-4 w-4 text-green-500" />
          <span>AI Provider</span>
        </div>
        <span>•</span>
        <div className="flex items-center gap-1">
          <Check className="h-4 w-4 text-green-500" />
          <span>Preferences</span>
        </div>
        <span>•</span>
        <span className="font-semibold text-foreground">All Set!</span>
      </div>

      {/* Complete button */}
      <div className="flex justify-center pt-4">
        <Button
          size="lg"
          onClick={handleComplete}
          className="min-w-[280px] text-lg h-14"
        >
          <Sparkles className="h-5 w-5 mr-2" />
          Start Using AGI Workforce
        </Button>
      </div>

      {/* Help text */}
      <div className="text-center text-sm text-muted-foreground">
        <p>You can change these settings anytime from the Settings page</p>
      </div>
    </div>
  );
};
