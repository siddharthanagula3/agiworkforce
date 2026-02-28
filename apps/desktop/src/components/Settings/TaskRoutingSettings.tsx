import { Info, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  MODEL_METADATA,
  getAllowedAutoModesForTier,
  isModelAllowedForTier,
  normalizeSubscriptionTier,
  type ModelMetadata,
} from '../../constants/llm';
import {
  useSettingsStore,
  type TaskCategory,
  type TaskRouting,
  type Provider,
} from '../../stores/settingsStore';
import { useAccountStore } from '../../stores/accountStore';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Button } from '../ui/Button';

/**
 * Task category metadata for display purposes
 */
const TASK_CATEGORY_INFO: Record<
  TaskCategory,
  { label: string; description: string; icon: string }
> = {
  code: {
    label: 'Code Generation',
    description: 'Writing, reviewing, and refactoring code',
    icon: 'code',
  },
  chat: {
    label: 'General Chat',
    description: 'Conversations, explanations, and Q&A',
    icon: 'message-circle',
  },
  search: {
    label: 'Web Search',
    description: 'Finding information and research',
    icon: 'search',
  },
  docs: {
    label: 'Documentation',
    description: 'Writing docs, README files, and technical writing',
    icon: 'file-text',
  },
  vision: {
    label: 'Vision & Images',
    description: 'Analyzing and understanding images',
    icon: 'eye',
  },
  image: {
    label: 'Image Generation',
    description: 'Creating images from text descriptions',
    icon: 'image',
  },
  video: {
    label: 'Video Generation',
    description: 'Creating video content',
    icon: 'video',
  },
};

/**
 * Get available models for a task category.
 * Filters models based on their type and capabilities.
 */
function getModelsForCategory(category: TaskCategory, planTier: string | null): ModelMetadata[] {
  const models = Object.values(MODEL_METADATA);
  const normalizedTier = normalizeSubscriptionTier(planTier);
  const allowedAutoModes = new Set(getAllowedAutoModesForTier(normalizedTier));

  // Auto modes are available for all categories
  const autoModes = models.filter(
    (m) => m.id === 'auto' || (m.id.startsWith('auto') && allowedAutoModes.has(m.id)),
  );

  const isTierAllowed = (model: ModelMetadata) => {
    if (model.id.startsWith('auto')) {
      return allowedAutoModes.has(model.id);
    }
    if (category === 'image' || category === 'video') {
      return true;
    }
    return isModelAllowedForTier(model.id, normalizedTier);
  };

  switch (category) {
    case 'code':
      return [
        ...autoModes,
        ...models.filter(
          (m) =>
            !m.id.startsWith('auto') &&
            isTierAllowed(m) &&
            (m.modelType === 'code' ||
              m.modelType === 'reasoning' ||
              (m.modelType === 'chat' && m.benchmarks?.swebench && m.benchmarks.swebench > 50)),
        ),
      ];
    case 'chat':
      return [
        ...autoModes,
        ...models.filter(
          (m) =>
            !m.id.startsWith('auto') &&
            isTierAllowed(m) &&
            (m.modelType === 'chat' || m.modelType === 'reasoning' || m.modelType === 'multimodal'),
        ),
      ];
    case 'search':
      return [
        ...autoModes,
        ...models.filter(
          (m) =>
            !m.id.startsWith('auto') &&
            isTierAllowed(m) &&
            (m.modelType === 'search' || m.capabilities.search),
        ),
      ];
    case 'docs':
      return [
        ...autoModes,
        ...models.filter(
          (m) =>
            !m.id.startsWith('auto') &&
            isTierAllowed(m) &&
            (m.modelType === 'chat' || m.modelType === 'reasoning' || m.modelType === 'code'),
        ),
      ];
    case 'vision':
      return [
        ...autoModes,
        ...models.filter(
          (m) =>
            !m.id.startsWith('auto') &&
            isTierAllowed(m) &&
            (m.modelType === 'multimodal' || m.capabilities.vision),
        ),
      ];
    case 'image':
      return models.filter(
        (m) =>
          m.modelType === 'image' ||
          m.id === 'auto' ||
          (m.id.startsWith('auto') && allowedAutoModes.has(m.id)),
      );
    case 'video':
      return models.filter(
        (m) =>
          m.modelType === 'video' ||
          m.id === 'auto' ||
          (m.id.startsWith('auto') && allowedAutoModes.has(m.id)),
      );
    default:
      return autoModes;
  }
}

/**
 * Default task routing configuration
 */
const DEFAULT_TASK_ROUTING: TaskRouting = {
  search: { provider: 'managed_cloud', model: 'auto' },
  code: { provider: 'managed_cloud', model: 'auto' },
  docs: { provider: 'managed_cloud', model: 'auto' },
  chat: { provider: 'managed_cloud', model: 'auto' },
  vision: { provider: 'managed_cloud', model: 'auto' },
  image: { provider: 'managed_cloud', model: 'auto' },
  video: { provider: 'managed_cloud', model: 'auto' },
};

export function TaskRoutingSettings() {
  const taskRouting = useSettingsStore(useShallow((state) => state.llmConfig.taskRouting));
  const setTaskRouting = useSettingsStore((state) => state.setTaskRouting);
  const account = useAccountStore((state) => state.account);
  const normalizedTier = normalizeSubscriptionTier(account.plan);

  const categories: TaskCategory[] = useMemo(
    () => ['code', 'chat', 'search', 'docs', 'vision', 'image', 'video'],
    [],
  );

  useEffect(() => {
    for (const category of categories) {
      const route = taskRouting[category];
      if (!route) {
        continue;
      }
      const availableModelIds = new Set(
        getModelsForCategory(category, normalizedTier).map((model) => model.id),
      );
      if (availableModelIds.has(route.model)) {
        continue;
      }
      setTaskRouting(category, 'managed_cloud', 'auto');
    }
  }, [categories, normalizedTier, setTaskRouting, taskRouting]);

  const handleModelChange = useCallback(
    (category: TaskCategory, modelId: string) => {
      // For now, all models use managed_cloud as provider
      // In the future, we could infer provider from MODEL_METADATA
      const model = MODEL_METADATA[modelId];
      const provider: Provider = model?.provider ?? 'managed_cloud';
      setTaskRouting(category, provider, modelId);
    },
    [setTaskRouting],
  );

  const handleResetToDefaults = useCallback(() => {
    for (const category of categories) {
      const defaultValue = DEFAULT_TASK_ROUTING[category];
      setTaskRouting(category, defaultValue.provider, defaultValue.model);
    }
  }, [categories, setTaskRouting]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-2">Task Routing</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Configure which model to use for different types of tasks. The system will automatically
            route requests to the appropriate model based on the task type.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleResetToDefaults} className="shrink-0">
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">How Task Routing Works</p>
            <p className="text-blue-600 dark:text-blue-400">
              When you send a message, the system analyzes its content and routes it to the
              configured model for that task type. Select "Auto" to let the system choose the best
              model automatically based on your subscription tier.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((category) => {
          const info = TASK_CATEGORY_INFO[category];
          const availableModels = getModelsForCategory(category, normalizedTier);
          const availableModelIds = new Set(availableModels.map((model) => model.id));
          const currentModel = availableModelIds.has(taskRouting[category]?.model ?? '')
            ? (taskRouting[category]?.model ?? 'auto')
            : 'auto';

          return (
            <div key={category} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Label htmlFor={`routing-${category}`} className="text-sm font-medium">
                    {info.label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
                </div>
                <div className="w-[200px] shrink-0">
                  <Select
                    value={currentModel}
                    onValueChange={(value) => handleModelChange(category, value)}
                  >
                    <SelectTrigger id={`routing-${category}`} className="h-9 text-sm">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model.id} value={model.id} className="text-sm">
                          <div className="flex items-center gap-2">
                            <span>{model.name}</span>
                            {model.id.startsWith('auto') && (
                              <span className="text-xs text-muted-foreground">(Recommended)</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <h4 className="text-sm font-medium mb-2">Model Selection Tips</h4>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>
            <strong>Auto (Economy)</strong> - Fastest and most cost-effective, good for simple tasks
          </li>
          <li>
            <strong>Auto Balanced</strong> - Balance of speed, cost, and quality for most tasks
          </li>
          <li>
            <strong>Auto (Best Model)</strong> - Highest quality for complex tasks, but slower
          </li>
          <li>
            <strong>Specific models</strong> - Choose when you need a particular model's strengths
          </li>
        </ul>
      </div>
    </div>
  );
}

export default TaskRoutingSettings;
