/**
 * ModelComparisonView
 *
 * Side-by-side model comparison view. Sends the same prompt to 2–3 models
 * concurrently and shows streaming responses with latency, token, and cost info.
 *
 * Uses invoke('send_message', ...) via the existing chat infrastructure.
 */
import React, { useCallback, useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '../../lib/tauri-mock';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { useModelStore } from '../../stores/modelStore';
import { getModelMetadata } from '../../constants/llm';
import { ComparisonControls } from './ComparisonControls';
import { ModelComparisonCard, type ComparisonResult } from './ModelComparisonCard';

interface SendMessageResponse {
  content?: string;
  error?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  cost_usd?: number;
}

const initialResult = (modelId: string): ComparisonResult => ({
  modelId,
  content: '',
  isStreaming: false,
  isComplete: false,
});

export const ModelComparisonView: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { availableModels } = useModelStore(
    useShallow((state) => ({ availableModels: state.availableModels })),
  );

  // Default to first two available models, or well-known fallbacks
  const defaultModels = React.useMemo(() => {
    const candidates = availableModels
      .filter((m) => m.provider !== 'suno' && m.provider !== 'udio')
      .slice(0, 2)
      .map((m) => m.id);
    if (candidates.length >= 2) return candidates;
    return ['claude-opus-4-6', 'gpt-4o'];
  }, [availableModels]);

  const [selectedModels, setSelectedModels] = useState<string[]>(defaultModels);
  const [prompt, setPrompt] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [results, setResults] = useState<ComparisonResult[]>([]);

  const updateResult = useCallback((modelId: string, updates: Partial<ComparisonResult>) => {
    setResults((prev) => prev.map((r) => (r.modelId === modelId ? { ...r, ...updates } : r)));
  }, []);

  const handleCompare = useCallback(async () => {
    if (!prompt.trim() || isComparing) return;

    setIsComparing(true);
    // Initialise result cards for each selected model
    setResults(selectedModels.map((id) => initialResult(id)));

    // Fire requests concurrently
    const startTime = Date.now();
    await Promise.allSettled(
      selectedModels.map(async (modelId) => {
        const modelMeta = getModelMetadata(modelId);
        const provider = modelMeta?.provider ?? 'openai';
        const modelStart = Date.now();

        updateResult(modelId, { isStreaming: true, isComplete: false, content: '' });

        try {
          const response = await invoke<SendMessageResponse>('send_message', {
            message: prompt,
            provider,
            model: modelId,
            conversationId: null,
            streaming: false,
          });

          const latencyMs = Date.now() - modelStart;
          const content = response?.content ?? '';
          const inputTokens = response?.usage?.input_tokens;
          const outputTokens = response?.usage?.output_tokens;
          const costUsd = response?.cost_usd;

          updateResult(modelId, {
            content,
            isStreaming: false,
            isComplete: true,
            latencyMs,
            inputTokens,
            outputTokens,
            costUsd,
          });
        } catch (err) {
          updateResult(modelId, {
            isStreaming: false,
            isComplete: true,
            error: getSimpleErrorMessage(err),
          });
        }
      }),
    );

    setIsComparing(false);
    void startTime; // suppress unused warning
  }, [prompt, selectedModels, isComparing, updateResult]);

  return (
    <div className={`flex flex-col gap-4 h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitCompareArrows size={18} className="text-blue-400" />
        <h2 className="text-base font-semibold text-gray-100">Model Comparison</h2>
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">Beta</span>
      </div>

      {/* Controls */}
      <ComparisonControls
        selectedModels={selectedModels}
        prompt={prompt}
        isComparing={isComparing}
        onPromptChange={setPrompt}
        onModelsChange={setSelectedModels}
        onCompare={() => void handleCompare()}
      />

      {/* Results */}
      {results.length > 0 ? (
        <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">
          {results.map((result, idx) => (
            <ModelComparisonCard key={result.modelId} result={result} index={idx} />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-800 text-gray-600 text-sm">
          Select models and enter a prompt to start comparing responses.
        </div>
      )}
    </div>
  );
};

export default ModelComparisonView;
