/**
 * useApiPromptCompletion Hook
 *
 * AI-powered prompt completion hook similar to Gemini CLI's implementation.
 * Provides ghost text suggestions by making API calls to the LLM router.
 *
 * Features:
 * - 250ms debounce to reduce API calls while typing
 * - AbortController for cancelling stale requests
 * - Minimum 5 character input requirement
 * - Configurable enable/disable
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Constants similar to Gemini CLI
const PROMPT_COMPLETION_DEBOUNCE_MS = 250;
const MIN_INPUT_LENGTH = 5;

export interface PromptCompletionState {
  /** The ghost text suggestion */
  suggestion: string;
  /** Whether a request is in progress */
  isLoading: boolean;
  /** Any error from the API */
  error: string | null;
  /** The model that generated the suggestion */
  model: string | null;
  /** Latency of the last successful request */
  latencyMs: number | null;
}

export interface UseApiPromptCompletionOptions {
  /** Whether the feature is enabled (default: true) */
  enabled?: boolean;
  /** Optional context to include in the prompt */
  context?: string;
  /** Callback when suggestion changes */
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
  /** Accept the current suggestion (append to input) */
  accept: () => string;
  /** Clear the current suggestion */
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

  // Refs for managing async operations
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInputRef = useRef<string>('');

  // Clear suggestion
  const clear = useCallback(() => {
    setState((prev) => ({
      ...prev,
      suggestion: '',
      error: null,
    }));
    onSuggestionChange?.('');
  }, [onSuggestionChange]);

  // Accept the current suggestion
  const accept = useCallback((): string => {
    const accepted = state.suggestion;
    clear();
    return accepted;
  }, [state.suggestion, clear]);

  // Fetch completion from API
  const fetchCompletion = useCallback(
    async (inputText: string) => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Check if aborted before making request
        if (abortController.signal.aborted) {
          return;
        }

        const response = await invoke<PromptCompletionResponse>('get_prompt_completion', {
          request: {
            input: inputText,
            context: context || null,
          },
        });

        // Check if aborted after request completes
        if (abortController.signal.aborted) {
          return;
        }

        // Validate suggestion - it should not repeat the input
        let suggestion = response.suggestion;

        // If the suggestion starts with the input, strip it
        if (suggestion.toLowerCase().startsWith(inputText.toLowerCase())) {
          suggestion = suggestion.slice(inputText.length).trim();
        }

        // Clean up common prefixes the LLM might add
        suggestion = suggestion
          .replace(/^[\s,.:;]+/, '') // Remove leading punctuation
          .trim();

        setState({
          suggestion,
          isLoading: false,
          error: null,
          model: response.model,
          latencyMs: response.latency_ms,
        });

        onSuggestionChange?.(suggestion);
      } catch (error) {
        // Ignore abort errors
        if (abortController.signal.aborted) {
          return;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);

        // Don't show error for expected cases
        if (errorMessage.includes('Input too short')) {
          setState((prev) => ({
            ...prev,
            suggestion: '',
            isLoading: false,
            error: null,
          }));
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

  // Effect to handle debounced completion
  useEffect(() => {
    // Clear any existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    // Don't fetch if disabled
    if (!enabled) {
      clear();
      return;
    }

    // Don't fetch if input is too short
    const trimmedInput = input.trim();
    if (trimmedInput.length < MIN_INPUT_LENGTH) {
      clear();
      return;
    }

    // Don't fetch if input starts with slash (command)
    if (trimmedInput.startsWith('/')) {
      clear();
      return;
    }

    // Don't fetch if input hasn't changed meaningfully
    if (trimmedInput === lastInputRef.current) {
      return;
    }

    lastInputRef.current = trimmedInput;

    // Set up debounced fetch
    debounceTimeoutRef.current = setTimeout(() => {
      fetchCompletion(trimmedInput);
    }, PROMPT_COMPLETION_DEBOUNCE_MS);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [input, enabled, fetchCompletion, clear]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
