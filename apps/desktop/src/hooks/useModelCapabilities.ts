import { useState, useEffect, useRef } from 'react';
import { invoke } from '../lib/tauri-mock';
import { resolveKnownModelCapabilities, type ResolvedCapabilities } from '../lib/modelCapabilities';
import { useSettingsStore } from '../stores/settingsStore';
import type { Provider } from '../types/provider';

interface UseModelCapabilitiesReturn {
  capabilities: ResolvedCapabilities | null;
  isLoading: boolean;
  /** True when an Ollama model uses prompt injection for tools (less reliable than native) */
  isToolFallback: boolean;
}

// Cache Ollama results to avoid repeated Tauri calls
const ollamaCapabilityCache = new Map<string, ResolvedCapabilities>();

export function useModelCapabilities(
  modelId: string | null,
  provider: Provider | null,
  ollamaBaseUrl?: string,
): UseModelCapabilitiesReturn {
  const customModels = useSettingsStore((state) => state.customModels);
  const [capabilities, setCapabilities] = useState<ResolvedCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!modelId || !provider) {
      setCapabilities(null);
      return;
    }

    const resolved = resolveKnownModelCapabilities(modelId, provider, customModels);
    if (resolved) {
      setCapabilities(resolved);
      setIsLoading(false);
      return;
    }

    if (provider !== 'ollama') {
      setCapabilities(null);
      setIsLoading(false);
      return;
    }

    // For Ollama: check cache first, then query Tauri command
    const cacheKey = `${ollamaBaseUrl || 'http://localhost:11434'}:${modelId}`;
    const cached = ollamaCapabilityCache.get(cacheKey);
    if (cached) {
      setCapabilities(cached);
      setIsLoading(false);
      return;
    }

    // Query backend
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);

    invoke<{
      supports_tools: boolean;
      supports_vision: boolean;
      supports_streaming: boolean;
      supports_thinking: boolean;
      context_length: number;
      tool_mode: string;
    }>('get_model_capabilities', {
      provider: 'ollama',
      modelId,
      baseUrl: ollamaBaseUrl || null,
    })
      .then((result) => {
        if (requestIdRef.current !== currentRequestId) return; // Stale response
        const resolved: ResolvedCapabilities = {
          supportsVision: result.supports_vision,
          supportsTools: result.supports_tools || result.tool_mode === 'prompt_injection',
          supportsStreaming: result.supports_streaming,
          supportsThinking: result.supports_thinking,
          contextLength: result.context_length,
          toolMode: result.tool_mode as ResolvedCapabilities['toolMode'],
          computerUse: result.supports_tools || result.tool_mode === 'prompt_injection',
          search: false,
          codeExecution: result.supports_tools || result.tool_mode === 'prompt_injection',
          imageGen: false,
          agentic: result.supports_tools || result.tool_mode === 'prompt_injection',
          source: 'ollama-runtime',
        };
        ollamaCapabilityCache.set(cacheKey, resolved);
        setCapabilities(resolved);
      })
      .catch((err) => {
        if (requestIdRef.current !== currentRequestId) return;
        console.warn('[useModelCapabilities] Failed to detect Ollama capabilities:', err);
        // Fallback: assume basic capabilities
        setCapabilities({
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true,
          supportsThinking: false,
          contextLength: 4096,
          toolMode: 'none',
          computerUse: false,
          search: false,
          codeExecution: false,
          imageGen: false,
          agentic: false,
          source: 'unknown',
        });
      })
      .finally(() => {
        if (requestIdRef.current === currentRequestId) {
          setIsLoading(false);
        }
      });
  }, [customModels, modelId, provider, ollamaBaseUrl]);

  return {
    capabilities,
    isLoading,
    isToolFallback: capabilities?.toolMode === 'prompt_injection',
  };
}

/** Clear the frontend capability cache (e.g., when Ollama models change) */
export function clearCapabilityCache(): void {
  ollamaCapabilityCache.clear();
}
