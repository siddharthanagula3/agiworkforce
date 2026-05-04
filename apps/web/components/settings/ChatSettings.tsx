'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/utils/cn';

interface ModelOption {
  id: string;
  owned_by: string;
  tier: string;
}

const TIER_LABEL: Record<string, string> = {
  hobby: 'Economy',
  pro: 'Balanced',
  max: 'Premium',
};

const TIER_TO_STORE: Record<string, 'economy' | 'balanced' | 'premium'> = {
  hobby: 'economy',
  pro: 'balanced',
  max: 'premium',
};

export function ChatSettings() {
  const { showTokenCount, setShowTokenCount, streamingEnabled, setStreamingEnabled } =
    useSettingsStore();
  const { selectedModel, setSelectedModel } = useChatStore();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    setLoadingModels(true);
    fetch('/api/llm/v1/models', {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((data) => setModels(data.data || []))
      .catch((e: unknown) => {
        console.error('[ChatSettings] Failed to load models:', e);
      })
      .finally(() => setLoadingModels(false));
  }, []);

  function getToken(): string {
    // Non-blocking token read - components that need auth will handle redirects
    try {
      const raw = localStorage.getItem('sb-session');
      if (raw) {
        const parsed = JSON.parse(raw) as { access_token?: string };
        return parsed.access_token || '';
      }
    } catch {
      // ignore
    }
    return '';
  }

  const grouped = models.reduce<Record<string, ModelOption[]>>((acc, m) => {
    const tier = m.tier || 'hobby';
    acc[tier] = acc[tier] || [];
    acc[tier].push(m);
    return acc;
  }, {});

  const tierOrder = ['hobby', 'pro', 'max'];

  return (
    <div className="space-y-6">
      {/* Default model */}
      <div>
        <label className="text-sm font-medium text-zinc-200 block mb-1">Default Model</label>
        <p className="text-xs text-zinc-500 mb-3">Model used when starting new conversations.</p>
        {loadingModels ? (
          <div className="h-10 rounded-lg bg-zinc-800 animate-pulse" />
        ) : (
          <select
            value={selectedModel}
            onChange={(e) => {
              const model = models.find((m) => m.id === e.target.value);
              const tier = model ? (TIER_TO_STORE[model.tier] ?? 'balanced') : 'balanced';
              setSelectedModel(e.target.value, tier);
            }}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          >
            <optgroup label="Auto Modes">
              <option value="auto-economy">Auto (Economy)</option>
              <option value="auto-balanced">Auto (Balanced)</option>
              <option value="auto-premium">Auto (Premium)</option>
            </optgroup>
            {tierOrder.map((tier) => {
              const list = grouped[tier];
              if (!list?.length) return null;
              return (
                <optgroup key={tier} label={TIER_LABEL[tier] || tier}>
                  {list.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} ({m.owned_by})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        )}
      </div>

      {/* Toggles */}
      <div className="space-y-4">
        <ToggleRow
          label="Show Token Count"
          description="Display token usage below messages"
          checked={showTokenCount}
          onChange={setShowTokenCount}
        />
        <ToggleRow
          label="Streaming Responses"
          description="Show responses word-by-word as they arrive"
          checked={streamingEnabled}
          onChange={setStreamingEnabled}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none',
          checked ? 'bg-white' : 'bg-zinc-700',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 rounded-full shadow-lg transition-transform',
            checked ? 'translate-x-5 bg-black' : 'translate-x-0 bg-zinc-400',
          )}
        />
      </button>
    </div>
  );
}
