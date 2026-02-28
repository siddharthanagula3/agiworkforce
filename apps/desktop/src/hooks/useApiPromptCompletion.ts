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
  // AUDIT-007-009: AbortController is kept for API consistency but Tauri invoke
  // calls cannot actually be aborted. We use isMountedRef and request ID tracking
  // to handle stale responses instead.
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInputRef = useRef<string>('');
  const cooldownUntilRef = useRef(0);
  // AUDIT-007-009 fix: Track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  // AUDIT-007-009 fix: Track current request ID to ignore stale responses
  const currentRequestIdRef = useRef(0);

  const invalidatePendingRequest = useCallback(() => {
    currentRequestIdRef.current += 1;
  }, []);

  // Clear suggestion
  const clear = useCallback(() => {
    invalidatePendingRequest();
    setState((prev) => ({
      ...prev,
      suggestion: '',
      error: null,
    }));
    onSuggestionChange?.('');
  }, [invalidatePendingRequest, onSuggestionChange]);

  // Accept the current suggestion
  const accept = useCallback((): string => {
    const accepted = state.suggestion;
    clear();
    return accepted;
  }, [state.suggestion, clear]);

  // Fetch completion from API
  const fetchCompletion = useCallback(
    async (inputText: string) => {
      // Cancel any in-flight request (signals intent, though Tauri invoke won't actually abort)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for consistency with standard patterns
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // AUDIT-007-009 fix: Increment request ID to track this specific request
      // This allows us to ignore responses from stale requests
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
        // Check if aborted before making request
        if (abortController.signal.aborted) {
          return;
        }

        // AUDIT-007-009: Note that Tauri invoke cannot be aborted once started.
        // We rely on checking isMountedRef and requestId after completion instead.
        const response = await invoke<PromptCompletionResponse>('get_prompt_completion', {
          request: {
            input: inputText,
            context: context || null,
          },
        });

        // AUDIT-007-009 fix: Check if component is still mounted
        if (!isMountedRef.current) {
          return;
        }

        // AUDIT-007-009 fix: Check if this is still the current request
        // A newer request may have started while we were waiting
        if (thisRequestId !== currentRequestIdRef.current) {
          return;
        }

        // Check if aborted after request completes (for consistency)
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
        // AUDIT-007-009 fix: Check if component is still mounted before updating error state
        if (!isMountedRef.current) {
          return;
        }

        // AUDIT-007-009 fix: Ignore errors from stale requests
        if (thisRequestId !== currentRequestIdRef.current) {
          return;
        }

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
      invalidatePendingRequest();
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [input, enabled, fetchCompletion, clear, invalidatePendingRequest]);

  // Cleanup on unmount
  useEffect(() => {
    // AUDIT-007-009 fix: Set mounted state to true when effect runs
    isMountedRef.current = true;

    return () => {
      // AUDIT-007-009 fix: Mark as unmounted to prevent state updates
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
