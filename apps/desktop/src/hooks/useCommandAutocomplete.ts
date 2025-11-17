/**
 * useCommandAutocomplete Hook
 *
 * Handles @command autocomplete for file, folder, url, web commands.
 * Similar to Cursor/Claude Code @-mentions.
 *
 * Updated Nov 16, 2025: Fixed cleanup issues with timers and abort controller
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ContextItemType, ContextSuggestion, AutocompleteState } from '@agiworkforce/types';

/**
 * Command trigger patterns
 */
const COMMAND_TRIGGERS = ['@file', '@folder', '@url', '@web'] as const;

type CommandTrigger = (typeof COMMAND_TRIGGERS)[number];

/**
 * Parse input to detect @command trigger and query
 */
function parseCommand(
  text: string,
  cursorPosition: number,
): { trigger: CommandTrigger; query: string; startPos: number; endPos: number } | null {
  // Find the word at cursor position
  const beforeCursor = text.slice(0, cursorPosition);

  // Look for @command pattern
  const match = beforeCursor.match(/(@file|@folder|@url|@web)([^\s]*)$/);
  if (!match) {
    return null;
  }

  const trigger = match[1] as CommandTrigger;
  const query = match[2] || '';
  const startPos = beforeCursor.length - match[0].length;
  const endPos = cursorPosition;

  return { trigger, query, startPos, endPos };
}

/**
 * Options for useCommandAutocomplete
 */
export interface UseCommandAutocompleteOptions {
  onSelect?: (suggestion: ContextSuggestion) => void | Promise<void>;
  maxSuggestions?: number;
  debounceMs?: number;
}

/**
 * Return type for useCommandAutocomplete
 */
export interface UseCommandAutocompleteReturn {
  autocompleteState: AutocompleteState;
  handleInputChange: (text: string, cursorPosition: number) => void;
  handleKeyDown: (event: React.KeyboardEvent) => boolean; // Returns true if handled
  selectSuggestion: (suggestion: ContextSuggestion) => void;
  clearAutocomplete: () => void;
  isActive: boolean;
}

/**
 * Hook for @command autocomplete
 */
export function useCommandAutocomplete(
  options: UseCommandAutocompleteOptions = {},
): UseCommandAutocompleteReturn {
  const { onSelect, maxSuggestions = 10, debounceMs = 150 } = options;

  const [autocompleteState, setAutocompleteState] = useState<AutocompleteState>({
    active: false,
    trigger: '',
    query: '',
    suggestions: [],
    selectedIndex: 0,
  });

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  /**
   * Fetch suggestions based on trigger and query
   */
  const fetchSuggestions = useCallback(
    async (trigger: CommandTrigger, query: string): Promise<ContextSuggestion[]> => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        switch (trigger) {
          case '@file': {
            // Fetch file suggestions from Tauri backend
            const files = await invoke<string[]>('fs_search_files', {
              query: query || '',
              limit: maxSuggestions,
            });
            return files.map((file, index) => ({
              id: `file-${index}-${file}`,
              type: 'file' as ContextItemType,
              label: file.split('/').pop() || file,
              value: file,
              description: file,
              icon: 'File',
            }));
          }

          case '@folder': {
            // Fetch folder suggestions
            const folders = await invoke<string[]>('fs_search_folders', {
              query: query || '',
              limit: maxSuggestions,
            });
            return folders.map((folder, index) => ({
              id: `folder-${index}-${folder}`,
              type: 'folder' as ContextItemType,
              label: folder.split('/').pop() || folder,
              value: folder,
              description: folder,
              icon: 'Folder',
            }));
          }

          case '@url': {
            // Fetch recent URLs or parse URL
            const isValidUrl = /^https?:\/\/.+/.test(query);
            if (isValidUrl) {
              return [
                {
                  id: `url-${query}`,
                  type: 'url' as ContextItemType,
                  label: query,
                  value: query,
                  description: 'Add this URL',
                  icon: 'Link',
                },
              ];
            }
            // Could fetch from history or bookmarks
            return [];
          }

          case '@web': {
            // Web search suggestions
            if (query.length < 2) {
              return [];
            }
            // Could integrate with search API
            return [
              {
                id: `web-${query}`,
                type: 'web' as ContextItemType,
                label: query,
                value: query,
                description: `Search the web for "${query}"`,
                icon: 'Globe',
              },
            ];
          }

          default:
            return [];
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          return [];
        }
        console.error(`Failed to fetch ${trigger} suggestions:`, error);
        return [];
      }
    },
    [maxSuggestions],
  );

  /**
   * Handle input change
   */
  const handleInputChange = useCallback(
    (text: string, cursorPosition: number) => {
      const parsed = parseCommand(text, cursorPosition);

      if (!parsed) {
        // No @command detected, clear autocomplete
        setAutocompleteState((prev) => (prev.active ? { ...prev, active: false } : prev));
        return;
      }

      const { trigger, query } = parsed;

      // Update state immediately for trigger detection
      setAutocompleteState((prev) => ({
        ...prev,
        active: true,
        trigger,
        query,
        selectedIndex: 0,
      }));

      // Debounce suggestion fetching
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        void fetchSuggestions(trigger, query).then((suggestions) => {
          // Only update state if component is still mounted
          if (isMountedRef.current) {
            setAutocompleteState((prev) => ({
              ...prev,
              suggestions,
            }));
          }
        });
      }, debounceMs);
    },
    [fetchSuggestions, debounceMs],
  );

  /**
   * Clear autocomplete state
   */
  const clearAutocomplete = useCallback(() => {
    setAutocompleteState({
      active: false,
      trigger: '',
      query: '',
      suggestions: [],
      selectedIndex: 0,
    });
  }, []);

  /**
   * Select a suggestion
   */
  const selectSuggestion = useCallback(
    (suggestion: ContextSuggestion) => {
      const result = onSelect?.(suggestion);
      // If onSelect returns a Promise, wait for it before clearing
      if (result instanceof Promise) {
        void result.finally(() => clearAutocomplete());
      } else {
        clearAutocomplete();
      }
    },
    [onSelect, clearAutocomplete],
  );

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent): boolean => {
      if (!autocompleteState.active || autocompleteState.suggestions.length === 0) {
        return false;
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setAutocompleteState((prev) => ({
            ...prev,
            selectedIndex: Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1),
          }));
          return true;

        case 'ArrowUp':
          event.preventDefault();
          setAutocompleteState((prev) => ({
            ...prev,
            selectedIndex: Math.max(prev.selectedIndex - 1, 0),
          }));
          return true;

        case 'Enter':
        case 'Tab': {
          event.preventDefault();
          const selected = autocompleteState.suggestions[autocompleteState.selectedIndex];
          if (selected) {
            selectSuggestion(selected);
          }
          return true;
        }

        case 'Escape':
          event.preventDefault();
          clearAutocomplete();
          return true;

        default:
          return false;
      }
    },
    [autocompleteState, selectSuggestion, clearAutocomplete],
  );

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  return {
    autocompleteState,
    handleInputChange,
    handleKeyDown,
    selectSuggestion,
    clearAutocomplete,
    isActive: autocompleteState.active,
  };
}
