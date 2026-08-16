
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../lib/tauri-mock';

const PROMPT_COMPLETION_DEBOUNCE_MS = 250;
const MIN_INPUT_LENGTH = 5;
const PROMPT_COMPLETION_ERROR_COOLDOWN_MS = 30_000;
const PROMPT_COMPLETION_RATE_LIMIT_MESSAGE = 'prompt completion is temporarily rate-limited';

function parsePromptCompletionCooldownMs(errorMessage: string): number {
  const retryAfterMatch = errorMessage.match(/retry after\s+(\d+(?:\.\d+)?)\s*seconds?/i);
  if (retryAfterMatch) {
    return Math.max(Math.ceil(Number(retryAfterMatch[1]) * 1000), 1000);
  }

  const retryAtMatch = errorMessage.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
  if (retryAtMatch) {
    const retryAt = Date.parse(retryAtMatch[0]);
    if (Number.isFinite(retryAt)) {
      return Math.max(retryAt - Date.now(), 1000);
    }
  }

  return PROMPT_COMPLETION_ERROR_COOLDOWN_MS;
}

function isPromptCompletionRateLimited(errorMessage: string): boolean {
  const errorLower = errorMessage.toLowerCase();
  return (
    errorLower.includes(PROMPT_COMPLETION_RATE_LIMIT_MESSAGE) ||
    errorLower.includes('rate limit') ||
    errorLower.includes('too many requests') ||
    errorLower.includes('429')
  );
}

export interface PromptCompletionState {
  suggestion: string;
  isLoading: boolean;
  error: string | null;
  model: string | null;
  latencyMs: number | null;
}

export interface UseApiPromptCompletionOptions {
  enabled?: boolean;
  context?: string;
  onSuggestionChange?: (suggestion: string) => void;
}

interface PromptCompletionResponse {
  suggestion: string;
  model: string;
  latency_ms: number;
}

export function useApiPromptCompletion(
  input: string,
  options: UseApiPromptCompletionOptions = {},
): PromptCompletionState & {
  accept: () => string;
  clear: () => void;
} {
  const { enabled = true, context, onSuggestionChange } = options;

  const [state, setState] = useState<PromptCompletionState>({
    suggestion: '',
    isLoading: false,
    error: null,
    model: null,
    latencyMs: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInputRef = useRef<string>('');
  const cooldownUntilRef = useRef(0);
  const isMountedRef = useRef(true);
  const currentRequestIdRef = useRef(0);

  const invalidatePendingRequest = useCallback(() => {
    currentRequestIdRef.current += 1;
  }, []);

  const clear = useCallback(() => {
    invalidatePendingRequest();
    setState((prev) => ({
      ...prev,
      suggestion: '',
      error: null,
    }));
    onSuggestionChange?.('');
  }, [invalidatePendingRequest, onSuggestionChange]);

  const accept = useCallback((): string => {
    const accepted = state.suggestion;
    clear();
    return accepted;
  }, [state.suggestion, clear]);

  const fetchCompletion = useCallback(
    async (inputText: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      currentRequestIdRef.current += 1;
      const thisRequestId = currentRequestIdRef.current;

      if (cooldownUntilRef.current > Date.now()) {
        setState((prev) => ({
          ...prev,
          suggestion: '',
          isLoading: false,
          error: null,
        }));
        onSuggestionChange?.('');
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        if (abortController.signal.aborted) {
          return;
        }

        const response = await invoke<PromptCompletionResponse>('get_prompt_completion', {
          request: {
            input: inputText,
            context: context || null,
          },
        });

        if (!isMountedRef.current) {
          return;
        }

        if (thisRequestId !== currentRequestIdRef.current) {
          return;
        }

        if (abortController.signal.aborted) {
          return;
        }

        let suggestion = response.suggestion;

        if (suggestion.toLowerCase().startsWith(inputText.toLowerCase())) {
          suggestion = suggestion.slice(inputText.length).trim();
        }

        suggestion = suggestion
          .replace(/^[\s,.:;]+/, '')
          .trim();

        cooldownUntilRef.current = 0;
        setState({
          suggestion,
          isLoading: false,
          error: null,
          model: response.model,
          latencyMs: response.latency_ms,
        });

        onSuggestionChange?.(suggestion);
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        if (thisRequestId !== currentRequestIdRef.current) {
          return;
        }

        if (abortController.signal.aborted) {
          return;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('Input too short')) {
          setState((prev) => ({
            ...prev,
            suggestion: '',
            isLoading: false,
            error: null,
          }));
          return;
        }

        if (isPromptCompletionRateLimited(errorMessage)) {
          cooldownUntilRef.current = Date.now() + parsePromptCompletionCooldownMs(errorMessage);
          setState((prev) => ({
            ...prev,
            suggestion: '',
            isLoading: false,
            error: null,
          }));
          onSuggestionChange?.('');
          return;
        }

        console.warn('[useApiPromptCompletion] Failed to get completion:', errorMessage);
        setState((prev) => ({
          ...prev,
          suggestion: '',
          isLoading: false,
          error: errorMessage,
        }));
      }
    },
    [context, onSuggestionChange],
  );

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    if (!enabled) {
      clear();
      return;
    }

    const trimmedInput = input.trim();
    if (trimmedInput.length < MIN_INPUT_LENGTH) {
      clear();
      return;
    }

    if (trimmedInput.startsWith('/')) {
      clear();
      return;
    }

    if (trimmedInput === lastInputRef.current) {
      return;
    }

    lastInputRef.current = trimmedInput;

    debounceTimeoutRef.current = setTimeout(() => {
      fetchCompletion(trimmedInput);
    }, PROMPT_COMPLETION_DEBOUNCE_MS);

    return () => {
      invalidatePendingRequest();
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [input, enabled, fetchCompletion, clear, invalidatePendingRequest]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    ...state,
    accept,
    clear,
  };
}

export default useApiPromptCompletion;
