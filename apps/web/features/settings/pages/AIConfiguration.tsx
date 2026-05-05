/**
 * AI Configuration Page
 * Comprehensive settings page for configuring all AI providers and advanced features
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/card';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';
import { Textarea } from '@shared/ui/textarea';
import { Switch } from '@shared/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { Alert, AlertDescription } from '@shared/ui/alert';
import { getCsrfToken } from '@/lib/client/csrf';
import {
  Bot,
  Settings,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  TestTube,
  DollarSign,
  Save,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { toast } from 'sonner';
// Stubs for functions not yet migrated

import { settingsService } from '@features/settings/services/user-preferences';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import {
  getModelIdsForProvider,
  getModelMetadataById,
  getProviderDefaultModel,
  providerLabels,
} from '@agiworkforce/types';

interface ProviderConfig {
  name: string;
  apiKey: string;
  isConfigured: boolean;
  models: string[];
  defaultModel: string;
  costPerToken: number;
  maxTokens: number;
  features: string[];
  documentation: string;
  pricing: string;
}

const SUPPORTED_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'perplexity',
  'grok',
  'deepseek',
  'qwen',
  'moonshot',
  'zhipu',
] as const;

type SupportedProviderId = (typeof SUPPORTED_PROVIDER_IDS)[number];

const CATALOG_PROVIDER_ID: Record<SupportedProviderId, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  perplexity: 'perplexity',
  grok: 'xai',
  deepseek: 'deepseek',
  qwen: 'qwen',
  moonshot: 'moonshot',
  zhipu: 'zhipu',
};

const PROVIDER_LINKS: Record<
  SupportedProviderId,
  { documentation: string; pricing: string; label?: string }
> = {
  openai: {
    documentation: 'https://platform.openai.com/docs',
    pricing: 'https://openai.com/pricing',
  },
  anthropic: {
    documentation: 'https://docs.anthropic.com',
    pricing: 'https://www.anthropic.com/pricing',
  },
  google: {
    documentation: 'https://ai.google.dev/docs',
    pricing: 'https://ai.google.dev/pricing',
  },
  perplexity: {
    documentation: 'https://docs.perplexity.ai',
    pricing: 'https://www.perplexity.ai/pricing',
    label: 'Perplexity (Sonar)',
  },
  grok: {
    documentation: 'https://docs.x.ai',
    pricing: 'https://x.ai/pricing',
    label: 'xAI (Grok)',
  },
  deepseek: {
    documentation: 'https://platform.deepseek.com/docs',
    pricing: 'https://platform.deepseek.com/pricing',
  },
  qwen: {
    documentation: 'https://help.aliyun.com/qwen',
    pricing: 'https://www.alibabacloud.com/qwen/pricing',
    label: 'Qwen (Alibaba)',
  },
  moonshot: {
    documentation: 'https://platform.moonshot.cn/docs',
    pricing: 'https://platform.moonshot.cn/pricing',
    label: 'Moonshot (Kimi)',
  },
  zhipu: {
    documentation: 'https://open.bigmodel.cn/dev/api',
    pricing: 'https://open.bigmodel.cn/pricing',
    label: 'Zhipu (GLM)',
  },
};

const FEATURE_LABELS: Array<{
  label: string;
  matches: (provider: SupportedProviderId) => boolean;
}> = [
  { label: 'Streaming', matches: () => true },
  { label: 'Tool Use', matches: (provider) => providerHasCapability(provider, 'tools') },
  { label: 'Vision', matches: (provider) => providerHasCapability(provider, 'vision') },
  { label: 'Reasoning', matches: (provider) => providerHasCapability(provider, 'thinking') },
  { label: 'Computer Use', matches: (provider) => providerHasCapability(provider, 'computerUse') },
  {
    label: 'Code Execution',
    matches: (provider) => providerHasCapability(provider, 'codeExecution'),
  },
  { label: 'Web Search', matches: (provider) => providerHasCapability(provider, 'search') },
  { label: 'Research', matches: (provider) => providerHasCapability(provider, 'research') },
  { label: 'Image Gen', matches: (provider) => providerHasCapability(provider, 'imageGen') },
  { label: 'Video Gen', matches: (provider) => providerHasCapability(provider, 'videoGen') },
  { label: 'Long Context', matches: (provider) => providerHasLongContext(provider) },
];

function toCatalogProviderId(provider: SupportedProviderId): string {
  return CATALOG_PROVIDER_ID[provider];
}

function getProviderModelIds(provider: SupportedProviderId): string[] {
  return getModelIdsForProvider(toCatalogProviderId(provider), {
    includeDeprecated: false,
    modelTypes: ['chat', 'code', 'reasoning', 'multimodal', 'search'],
  });
}

function providerHasCapability(
  provider: SupportedProviderId,
  capability: keyof NonNullable<ReturnType<typeof getModelMetadataById>>['capabilities'],
): boolean {
  return getProviderModelIds(provider).some((modelId) => {
    const metadata = getModelMetadataById(modelId);
    return Boolean(metadata?.capabilities?.[capability]);
  });
}

function providerHasLongContext(provider: SupportedProviderId): boolean {
  return getProviderModelIds(provider).some((modelId) => {
    const metadata = getModelMetadataById(modelId);
    return (metadata?.contextWindow ?? 0) >= 128_000;
  });
}

function getProviderFeatures(provider: SupportedProviderId): string[] {
  return FEATURE_LABELS.filter((feature) => feature.matches(provider)).map(
    (feature) => feature.label,
  );
}

function getProviderDisplayName(provider: SupportedProviderId): string {
  return (
    PROVIDER_LINKS[provider].label ?? providerLabels[toCatalogProviderId(provider)] ?? provider
  );
}

const PROVIDER_CONFIGS: Record<
  SupportedProviderId,
  Omit<ProviderConfig, 'apiKey' | 'isConfigured'>
> = Object.fromEntries(
  SUPPORTED_PROVIDER_IDS.map((provider) => {
    const models = getProviderModelIds(provider);
    const defaultModel = getProviderDefaultModel(toCatalogProviderId(provider)) ?? models[0] ?? '';
    const defaultModelMetadata = getModelMetadataById(defaultModel);

    return [
      provider,
      {
        name: getProviderDisplayName(provider),
        models,
        defaultModel,
        costPerToken: (defaultModelMetadata?.inputCost ?? 0) / 1_000_000,
        maxTokens: defaultModelMetadata?.maxOutputTokens ?? 8192,
        features: getProviderFeatures(provider),
        documentation: PROVIDER_LINKS[provider].documentation,
        pricing: PROVIDER_LINKS[provider].pricing,
      },
    ];
  }),
) as Record<SupportedProviderId, Omit<ProviderConfig, 'apiKey' | 'isConfigured'>>;

const AIConfigurationPageContent: React.FC = () => {
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>({});
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState('overview');
  const [testResults, setTestResults] = useState<Record<string, 'pending' | 'success' | 'error'>>(
    {},
  );

  // User AI preferences
  const [defaultProvider, setDefaultProvider] = useState<string>('openai');
  const [defaultModel, setDefaultModel] = useState<string>(PROVIDER_CONFIGS.openai.defaultModel);
  const [preferStreaming, setPreferStreaming] = useState<boolean>(true);
  const [aiTemperature, setAiTemperature] = useState<number>(0.7);
  const [aiMaxTokens, setAiMaxTokens] = useState<number>(4000);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // Advanced settings (per-session state — no backend persistence needed)
  const [autoFallback, setAutoFallback] = useState<boolean>(true);
  const [rateLimiting, setRateLimiting] = useState<boolean>(true);

  // Load user preferences
  useEffect(() => {
    const loadUserPreferences = async () => {
      const { data, error } = await settingsService.getSettings();
      if (!error && data) {
        if (data.default_ai_provider) setDefaultProvider(data.default_ai_provider);
        if (data.default_ai_model) setDefaultModel(data.default_ai_model);
        if (data.prefer_streaming !== undefined) setPreferStreaming(data.prefer_streaming);
        if (data.ai_temperature !== undefined) setAiTemperature(data.ai_temperature);
        if (data.ai_max_tokens !== undefined) setAiMaxTokens(data.ai_max_tokens);
      }
    };

    loadUserPreferences();
  }, []);

  // Initialize configurations
  useEffect(() => {
    // SECURITY: API keys are managed server-side, not exposed to client
    // Providers default to not-configured until an API key is set

    const initialConfigs: Record<string, ProviderConfig> = {};

    Object.entries(PROVIDER_CONFIGS).forEach(([key, config]) => {
      // SECURITY: Never read API keys from localStorage or environment
      // API keys are managed server-side by Netlify proxy functions
      const apiKey = '';
      initialConfigs[key] = {
        ...config,
        apiKey,
        // Default to not configured — badge updates when an API key is provided
        isConfigured: false,
      };
    });

    setConfigs(initialConfigs);
  }, []);

  const handleApiKeyChange = (provider: string, apiKey: string) => {
    setConfigs((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider]!,
        apiKey,
        isConfigured: !!apiKey,
      },
    }));

    // SECURITY: API keys should NOT be saved to localStorage
    // A static info message is shown near the input field instead
  };

  const handleTestProvider = async (provider: string) => {
    setTestResults((prev) => ({ ...prev, [provider]: 'pending' }));

    try {
      // Auth is managed via Supabase SSR cookies (set by middleware) — no manual token needed.
      // SECURITY (web-MED-1): the prior `csrf-token` cookie reader was dead
      // code — the server never sets that cookie; CSRF is bound to the
      // `anon-session-id` cookie + an HMAC token returned by `/api/csrf`.
      // Using the canonical helper guarantees a token actually exists.
      let csrfToken = '';
      try {
        csrfToken = await getCsrfToken();
      } catch {
        // /api/csrf unreachable — let the server reject the request.
      }

      const response = await fetch('/api/settings/test-provider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ provider }),
      });

      const data = (await response.json()) as { success: boolean; error?: string };

      setTestResults((prev) => ({
        ...prev,
        [provider]: data.success ? 'success' : 'error',
      }));

      if (data.success) {
        toast.success(`${provider} API test successful!`);
      } else {
        toast.error(`${provider} API test failed: ${data.error ?? 'Unknown error'}`);
      }
    } catch (_error) {
      setTestResults((prev) => ({ ...prev, [provider]: 'error' }));
      toast.error(`Failed to test ${provider} API`);
    }
  };

  const handleCopyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
    toast.success('API key copied to clipboard');
  };

  const handleClearApiKey = (provider: string) => {
    handleApiKeyChange(provider, '');
    toast.success(`${provider} API key cleared`);
  };

  const handleSaveAIPreferences = async () => {
    setIsSavingPreferences(true);
    try {
      const { error } = await settingsService.updateSettings({
        default_ai_provider: defaultProvider as
          | 'openai'
          | 'anthropic'
          | 'google'
          | 'perplexity'
          | 'grok'
          | 'deepseek'
          | 'qwen'
          | 'moonshot'
          | 'zhipu',
        default_ai_model: defaultModel,
        prefer_streaming: preferStreaming,
        ai_temperature: aiTemperature,
        ai_max_tokens: aiMaxTokens,
      });

      if (error) {
        toast.error(`Failed to save AI preferences: ${error}`);
      } else {
        toast.success('AI preferences saved successfully!');
      }
    } catch (_error) {
      toast.error('Failed to save AI preferences');
      // Error already shown via toast; no need to log to console in production
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const getModelsForProvider = (provider: string): string[] => {
    const config = PROVIDER_CONFIGS[provider as SupportedProviderId];
    return config ? config.models : [];
  };

  const configuredProviders = Object.values(configs).filter((config) => config.isConfigured);
  const totalCost = configuredProviders.reduce(
    (sum, config) => sum + config.costPerToken * config.maxTokens,
    0,
  );

  const renderProviderCard = (provider: string, config: ProviderConfig) => (
    <Card key={provider} className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                config.isConfigured ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600',
              )}
            >
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{config.name}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={config.isConfigured ? 'default' : 'secondary'}>
                  {config.isConfigured ? 'Configured' : 'Not Configured'}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  ${config.costPerToken.toFixed(6)}/token
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {config.isConfigured && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestProvider(provider)}
                disabled={testResults[provider] === 'pending'}
              >
                {testResults[provider] === 'pending' ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                ) : testResults[provider] === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : testResults[provider] === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                ) : (
                  <TestTube className="h-4 w-4" />
                )}
                Test
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* API Key Input */}
        <div className="space-y-2">
          <Label htmlFor={`api-key-${provider}`}>API Key</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`api-key-${provider}`}
              type={showApiKeys[provider] ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => handleApiKeyChange(provider, e.target.value)}
              placeholder={`Enter your ${provider} API key...`}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setShowApiKeys((prev) => ({
                    ...prev,
                    [provider]: !prev[provider],
                  }))
                }
                className="flex-1 sm:flex-none"
              >
                {showApiKeys[provider] ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              {config.apiKey && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyApiKey(config.apiKey)}
                    className="flex-1 sm:flex-none"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearApiKey(provider)}
                    className="flex-1 sm:flex-none"
                  >
                    <span className="hidden sm:inline">Clear</span>
                    <span className="sm:hidden">X</span>
                  </Button>
                </>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            API keys cannot be saved from the UI. Please update your .env file instead.
          </p>
        </div>

        {/* Features */}
        <div className="space-y-2">
          <Label>Features</Label>
          <div className="flex flex-wrap gap-2">
            {config.features.map((feature) => (
              <Badge key={feature} variant="outline" className="text-xs">
                {feature}
              </Badge>
            ))}
          </div>
        </div>

        {/* Documentation Links */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(config.documentation, '_blank')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Documentation
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(config.pricing, '_blank')}>
            <DollarSign className="mr-2 h-4 w-4" />
            Pricing
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto space-y-4 p-4 md:space-y-6 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
          <Settings className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">AI Configuration</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Configure your AI providers and advanced settings
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="text-xs md:text-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger value="providers" className="text-xs md:text-sm">
            Providers
          </TabsTrigger>
          <TabsTrigger value="advanced" className="text-xs md:text-sm">
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Configured Providers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{configuredProviders.length}</div>
                <p className="text-xs text-muted-foreground">
                  out of {Object.keys(configs).length} available
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Estimated Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
                <p className="text-xs text-muted-foreground">per 1000 tokens</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Models</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(configs).reduce((sum, config) => sum + config.models.length, 0)}
                </div>
                <p className="text-xs text-muted-foreground">across all providers</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {Object.entries(configs).map(([provider, config]) => (
              <Card key={provider}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{config.name}</CardTitle>
                    <Badge variant={config.isConfigured ? 'default' : 'secondary'}>
                      {config.isConfigured ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Models:</span>
                      <div className="font-medium">{config.models.length}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cost:</span>
                      <div className="font-medium">${config.costPerToken.toFixed(6)}/token</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {config.features.slice(0, 3).map((feature) => (
                      <Badge key={feature} variant="outline" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                    {config.features.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{config.features.length - 3} more
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Providers Tab */}
        <TabsContent value="providers" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Object.entries(configs).map(([provider, config]) =>
              renderProviderCard(provider, config),
            )}
          </div>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Default AI Settings</CardTitle>
                <Button onClick={handleSaveAIPreferences} disabled={isSavingPreferences} size="sm">
                  {isSavingPreferences ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Preferences
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertDescription>
                  These settings will be used as defaults for general chat. Specific features may
                  override these settings based on task requirements.
                </AlertDescription>
              </Alert>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default-provider">Default AI Provider</Label>
                  <Select
                    value={defaultProvider}
                    onValueChange={(value) => {
                      setDefaultProvider(value);
                      const providerConfig = PROVIDER_CONFIGS[value as SupportedProviderId];
                      if (providerConfig) {
                        setDefaultModel(providerConfig.defaultModel);
                      }
                    }}
                  >
                    <SelectTrigger id="default-provider">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_PROVIDER_IDS.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {PROVIDER_CONFIGS[provider].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Provider for general chat conversations
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-model">Default AI Model</Label>
                  <Select value={defaultModel} onValueChange={setDefaultModel}>
                    <SelectTrigger id="default-model">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelsForProvider(defaultProvider).map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Model to use for the selected provider
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-temperature">Temperature ({aiTemperature})</Label>
                  <Input
                    id="ai-temperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={aiTemperature}
                    onChange={(e) => setAiTemperature(parseFloat(e.target.value))}
                  />
                  <p className="text-sm text-muted-foreground">
                    Controls randomness (0 = focused, 2 = creative)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-max-tokens">Max Tokens</Label>
                  <Input
                    id="ai-max-tokens"
                    type="number"
                    min="100"
                    max="32000"
                    step="100"
                    value={aiMaxTokens}
                    onChange={(e) => setAiMaxTokens(parseInt(e.target.value))}
                  />
                  <p className="text-sm text-muted-foreground">Maximum response length</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Streaming</Label>
                  <p className="text-sm text-muted-foreground">
                    Stream responses in real-time as they&apos;re generated
                  </p>
                </div>
                <Switch checked={preferStreaming} onCheckedChange={setPreferStreaming} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Prompts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Default System Prompt</Label>
                <Textarea placeholder="Enter your default system prompt..." rows={4} />
              </div>

              <div className="space-y-2">
                <Label>Custom Prompts</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="Prompt name..." />
                    <Button variant="outline">Add</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto Fallback</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically try other providers if one fails
                  </p>
                </div>
                <Switch checked={autoFallback} onCheckedChange={setAutoFallback} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Rate Limiting</Label>
                  <p className="text-sm text-muted-foreground">Enable automatic rate limiting</p>
                </div>
                <Switch checked={rateLimiting} onCheckedChange={setRateLimiting} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const AIConfigurationPageWithErrorBoundary: React.FC = () => (
  <ErrorBoundary componentName="AIConfigurationPage" showReportDialog>
    <AIConfigurationPageContent />
  </ErrorBoundary>
);

export default AIConfigurationPageWithErrorBoundary;
