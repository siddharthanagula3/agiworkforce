/**
 * Unit tests for modelStore.
 *
 * Covers:
 *  - thinkingEnabledPerModel tracks per-model state
 *  - toggleThinkingForModel toggles correctly
 *  - toggleThinkingForModel guards against non-thinking models
 *  - isThinkingEnabledForSelected() returns correct value
 *  - setModel pushes to recents and syncs legacy thinkingModeEnabled
 *  - toggleFavorite adds/removes model ids
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import { useModelStore } from '../stores/modelStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useModelStore.getState();
}

function resetStore() {
  useModelStore.setState({
    selectedModel: 'auto-balanced',
    selectedProvider: 'managed_cloud',
    favorites: [],
    recentModels: [],
    thinkingModeEnabled: false,
    thinkingEnabledPerModel: {},
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('modelStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // ---- thinkingEnabledPerModel ----

  describe('thinkingEnabledPerModel', () => {
    it('starts with an empty record', () => {
      expect(getState().thinkingEnabledPerModel).toEqual({});
    });

    it('tracks per-model thinking state after toggle', () => {
      getState().toggleThinkingForModel('claude-opus-4.7');

      expect(getState().thinkingEnabledPerModel['claude-opus-4.7']).toBe(true);
    });

    it('maintains separate state for different models', () => {
      getState().toggleThinkingForModel('claude-opus-4.7');
      getState().toggleThinkingForModel('gpt-5.4');

      const perModel = getState().thinkingEnabledPerModel;
      expect(perModel['claude-opus-4.7']).toBe(true);
      expect(perModel['gpt-5.4']).toBe(true);
    });
  });

  // ---- toggleThinkingForModel ----

  describe('toggleThinkingForModel', () => {
    it('toggles from false to true', () => {
      getState().toggleThinkingForModel('claude-opus-4.7');

      expect(getState().thinkingEnabledPerModel['claude-opus-4.7']).toBe(true);
    });

    it('toggles from true back to false', () => {
      getState().toggleThinkingForModel('claude-opus-4.7');
      getState().toggleThinkingForModel('claude-opus-4.7');

      expect(getState().thinkingEnabledPerModel['claude-opus-4.7']).toBe(false);
    });

    it('guards against non-thinking models (no-op)', () => {
      // claude-haiku-4.5 has supportsThinking: false
      getState().toggleThinkingForModel('claude-haiku-4.5');

      expect(getState().thinkingEnabledPerModel['claude-haiku-4.5']).toBeUndefined();
    });

    it('preserves gpt-5.4-nano as a distinct model after catalog refresh', () => {
      // 3129aa408 catalog refresh promoted nano to its own tier; nano no
      // longer collapses onto mini. The store should set the flag on nano.
      getState().toggleThinkingForModel('gpt-5.4-nano');

      expect(getState().thinkingEnabledPerModel['gpt-5.4-nano']).toBe(true);
      expect(getState().thinkingEnabledPerModel['gpt-5.4-mini']).toBeUndefined();
    });

    it('blocks toggle for auto modes', () => {
      getState().toggleThinkingForModel('auto-balanced');

      expect(getState().thinkingEnabledPerModel['auto-balanced']).toBeUndefined();
    });

    it('syncs legacy thinkingModeEnabled when toggling the currently selected model', () => {
      useModelStore.setState({ selectedModel: 'claude-opus-4.7' });

      getState().toggleThinkingForModel('claude-opus-4.7');

      expect(getState().thinkingModeEnabled).toBe(true);
    });

    it('does NOT sync legacy thinkingModeEnabled when toggling a non-selected model', () => {
      useModelStore.setState({
        selectedModel: 'auto-balanced',
        thinkingModeEnabled: false,
      });

      getState().toggleThinkingForModel('claude-opus-4.7');

      // Legacy field should remain unchanged
      expect(getState().thinkingModeEnabled).toBe(false);
    });
  });

  // ---- isThinkingEnabledForSelected ----

  describe('isThinkingEnabledForSelected', () => {
    it('returns false when no model has thinking enabled', () => {
      expect(getState().isThinkingEnabledForSelected()).toBe(false);
    });

    it('returns true when the selected model has thinking enabled', () => {
      useModelStore.setState({ selectedModel: 'claude-opus-4.7' });
      getState().toggleThinkingForModel('claude-opus-4.7');

      expect(getState().isThinkingEnabledForSelected()).toBe(true);
    });

    it('returns false when a different model has thinking enabled', () => {
      useModelStore.setState({ selectedModel: 'auto-balanced' });
      getState().toggleThinkingForModel('claude-opus-4.7');

      expect(getState().isThinkingEnabledForSelected()).toBe(false);
    });

    it('updates correctly after switching selected model', () => {
      // Enable thinking for opus
      getState().toggleThinkingForModel('claude-opus-4.7');

      // Select opus -> should be true
      useModelStore.setState({ selectedModel: 'claude-opus-4.7' });
      expect(getState().isThinkingEnabledForSelected()).toBe(true);

      // Switch to sonnet (thinking NOT enabled) -> should be false
      useModelStore.setState({ selectedModel: 'claude-sonnet-4.6' });
      expect(getState().isThinkingEnabledForSelected()).toBe(false);
    });
  });

  // ---- setModel ----

  describe('setModel', () => {
    it('updates selectedModel', () => {
      getState().setModel('gpt-5.4');

      expect(getState().selectedModel).toBe('gpt-5.4');
    });

    it('pushes model to recents (newest first)', () => {
      getState().setModel('gpt-5.4');
      getState().setModel('claude-opus-4.7');

      expect(getState().recentModels[0]).toBe('claude-opus-4.7');
      expect(getState().recentModels[1]).toBe('gpt-5.4');
    });

    it('deduplicates recents', () => {
      getState().setModel('gpt-5.4');
      getState().setModel('claude-opus-4.7');
      getState().setModel('gpt-5.4'); // duplicate

      const recents = getState().recentModels;
      expect(recents[0]).toBe('gpt-5.4');
      expect(recents.filter((id) => id === 'gpt-5.4')).toHaveLength(1);
    });

    it('limits recents to 5 entries', () => {
      const ids = [
        'gpt-5.4',
        'claude-opus-4.7',
        'gemini-3.1-pro-preview',
        'grok-4',
        'deepseek-chat',
        'sonar',
      ];
      for (const id of ids) {
        getState().setModel(id);
      }

      expect(getState().recentModels).toHaveLength(5);
      // The oldest (gpt-5.4) should be dropped
      expect(getState().recentModels).not.toContain('gpt-5.4');
    });

    it('syncs legacy thinkingModeEnabled from per-model state', () => {
      // Enable thinking for opus
      useModelStore.setState({
        thinkingEnabledPerModel: { 'claude-opus-4.7': true },
      });

      getState().setModel('claude-opus-4.7');

      expect(getState().thinkingModeEnabled).toBe(true);
    });

    it('sets legacy thinkingModeEnabled to false when switching to model without thinking enabled', () => {
      useModelStore.setState({
        thinkingModeEnabled: true,
        thinkingEnabledPerModel: { 'claude-opus-4.7': true },
      });

      getState().setModel('auto-balanced');

      expect(getState().thinkingModeEnabled).toBe(false);
    });
  });

  // ---- toggleFavorite ----

  describe('toggleFavorite', () => {
    it('adds a model to favorites', () => {
      getState().toggleFavorite('claude-opus-4.7');

      expect(getState().favorites).toContain('claude-opus-4.7');
    });

    it('removes a model from favorites on second toggle', () => {
      getState().toggleFavorite('claude-opus-4.7');
      getState().toggleFavorite('claude-opus-4.7');

      expect(getState().favorites).not.toContain('claude-opus-4.7');
    });

    it('maintains other favorites when toggling one', () => {
      getState().toggleFavorite('claude-opus-4.7');
      getState().toggleFavorite('gpt-5.4');
      getState().toggleFavorite('claude-opus-4.7'); // remove

      expect(getState().favorites).toEqual(['gpt-5.4']);
    });
  });

  // ---- setProvider ----

  describe('setProvider', () => {
    it('updates selectedProvider', () => {
      getState().setProvider('anthropic');

      expect(getState().selectedProvider).toBe('anthropic');
    });
  });

  // ---- setThinkingMode (legacy) ----

  describe('setThinkingMode (legacy)', () => {
    it('sets thinkingModeEnabled to true when model supports thinking', () => {
      useModelStore.setState({ selectedModel: 'claude-opus-4.7' });

      getState().setThinkingMode(true);

      expect(getState().thinkingModeEnabled).toBe(true);
    });

    it('guards against enabling thinking on non-thinking model', () => {
      useModelStore.setState({ selectedModel: 'claude-haiku-4.5' });

      getState().setThinkingMode(true);

      expect(getState().thinkingModeEnabled).toBe(false);
    });

    it('allows disabling thinking regardless of model support', () => {
      useModelStore.setState({
        selectedModel: 'claude-haiku-4.5',
        thinkingModeEnabled: true,
      });

      getState().setThinkingMode(false);

      expect(getState().thinkingModeEnabled).toBe(false);
    });
  });
});
