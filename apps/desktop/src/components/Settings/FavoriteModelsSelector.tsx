import { useState } from 'react';
import { Plus, X, Star } from 'lucide-react';
import { useSettingsStore, type Provider } from '../../stores/settingsStore';
import { Label } from '../ui/Label';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';

const PROVIDER_OPTIONS: Provider[] = [
  'ollama',
  'openai',
  'anthropic',
  'google',
  'xai',
  'deepseek',
  'qwen',
  'mistral',
];

const MODEL_SUGGESTIONS: Record<Provider, string[]> = {
  ollama: ['llama3', 'llama3.1', 'llama3.3', 'qwen2.5', 'deepseek-coder', 'codellama'],
  openai: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  anthropic: [
    'claude-3-sonnet',
    'claude-3-opus',
    'claude-3-haiku',
    'claude-3-5-sonnet',
    'claude-sonnet-4-5',
  ],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.5-pro'],
  xai: ['grok-2', 'grok-3', 'grok-4'],
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner', 'deepseek-v3'],
  qwen: ['qwen-max', 'qwen-plus', 'qwen-coder', 'qwen2.5'],
  mistral: ['mistral-large-latest', 'codestral-latest', 'mistral-small-latest'],
};

/**
 * FavoriteModelsSelector - Manage quick-access models for the chat toolbar
 *
 * Allows users to add/remove favorite models that appear in the model selector
 * dropdown in the ChatInputToolbar. Models are stored in format "provider/model".
 */
export function FavoriteModelsSelector() {
  const { llmConfig, setFavoriteModels, addFavoriteModel, removeFavoriteModel } =
    useSettingsStore();
  const favoriteModels = llmConfig?.favoriteModels ?? [];

  const [selectedProvider, setSelectedProvider] = useState<Provider>('ollama');
  const [selectedModel, setSelectedModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const handleAddModel = () => {
    const modelName = useCustom ? customModel.trim() : selectedModel;
    if (!modelName) return;

    const fullModelId = `${selectedProvider}/${modelName}`;
    if (!favoriteModels.includes(fullModelId)) {
      addFavoriteModel(fullModelId);
      setCustomModel('');
      setSelectedModel('');
    }
  };

  const handleRemoveModel = (model: string) => {
    removeFavoriteModel(model);
  };

  const parseModel = (model: string) => {
    const [provider, name] = model.split('/');
    return { provider: provider as Provider, name };
  };

  const getProviderColor = (provider: string) => {
    const colors: Record<string, string> = {
      ollama: 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400',
      openai: 'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400',
      anthropic: 'bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400',
      google: 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400',
      xai: 'bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400',
      deepseek: 'bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400',
      qwen: 'bg-pink-100 dark:bg-pink-950/30 text-pink-700 dark:text-pink-400',
      mistral: 'bg-cyan-100 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400',
    };
    return colors[provider] || 'bg-gray-100 dark:bg-gray-950/30 text-gray-700 dark:text-gray-400';
  };

  const availableModels = MODEL_SUGGESTIONS[selectedProvider] || [];

  return (
    <div className="space-y-4">
      <div>
        <Label>Favorite Models</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Quick-access models that appear in the chat toolbar model selector. Ollama models are
          prioritized for cost-free local inference.
        </p>
      </div>

      {/* Current Favorite Models */}
      <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-muted/30 min-h-[60px]">
        {favoriteModels.length === 0 ? (
          <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
            <Star className="h-4 w-4 mr-2" />
            No favorite models yet. Add some below!
          </div>
        ) : (
          favoriteModels.map((model) => {
            const { provider, name } = parseModel(model);
            return (
              <Badge
                key={model}
                variant="outline"
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5',
                  getProviderColor(provider),
                )}
              >
                <span className="text-xs font-semibold">{provider?.toUpperCase()}</span>
                <span className="text-xs">{name}</span>
                <button
                  onClick={() => handleRemoveModel(model)}
                  className="ml-1 hover:text-destructive transition-colors"
                  title="Remove from favorites"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })
        )}
      </div>

      {/* Add New Favorite Model */}
      <div className="space-y-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Add Favorite Model</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="provider-select" className="text-xs">
              Provider
            </Label>
            <Select
              value={selectedProvider}
              onValueChange={(value) => {
                setSelectedProvider(value as Provider);
                setSelectedModel('');
                setUseCustom(false);
              }}
            >
              <SelectTrigger id="provider-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ollama">Ollama (Local)</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="google">Google AI</SelectItem>
                <SelectItem value="xai">XAI (Grok)</SelectItem>
                <SelectItem value="deepseek">DeepSeek</SelectItem>
                <SelectItem value="qwen">Qwen</SelectItem>
                <SelectItem value="mistral">Mistral AI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-select" className="text-xs">
              Model
            </Label>
            {useCustom ? (
              <Input
                id="custom-model-input"
                placeholder="Enter model name"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                className="h-9"
              />
            ) : (
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="model-select">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUseCustom(!useCustom)}
            className="text-xs"
          >
            {useCustom ? 'Choose from list' : 'Enter custom model'}
          </Button>

          <Button
            size="sm"
            onClick={handleAddModel}
            disabled={useCustom ? !customModel.trim() : !selectedModel}
          >
            <Plus className="h-3 w-3 mr-1.5" />
            Add to Favorites
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-3">
        <p className="text-xs text-muted-foreground">
          <strong>Tip:</strong> Ollama models run locally and don't incur API costs. They'll
          appear first in the chat toolbar for quick selection.
        </p>
      </div>
    </div>
  );
}
