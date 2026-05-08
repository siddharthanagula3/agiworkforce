import { beforeEach, describe, expect, it } from 'vitest';

import {
  useTierStore,
  selectTier,
  selectCanSwitchProvider,
  selectIsFreePlan,
  selectIsCrossProviderSwitch,
  selectProviderSwitchGate,
} from '../tierStore';

function reset() {
  useTierStore.setState({ tier: 'byok', currentConversationProvider: null });
}

describe('tierStore', () => {
  beforeEach(reset);

  describe('selectTier / setTier', () => {
    it('starts at byok by default', () => {
      expect(selectTier(useTierStore.getState())).toBe('byok');
    });

    it('updates tier via setTier', () => {
      useTierStore.getState().setTier('pro_plus');
      expect(selectTier(useTierStore.getState())).toBe('pro_plus');
    });
  });

  describe('selectIsFreePlan', () => {
    it.each([
      ['local', true],
      ['byok', true],
      ['hobby', false],
      ['pro', false],
      ['pro_plus', false],
      ['max', false],
    ] as const)('%s → %s', (tier, expected) => {
      useTierStore.getState().setTier(tier);
      expect(selectIsFreePlan(useTierStore.getState())).toBe(expected);
    });
  });

  describe('selectCanSwitchProvider', () => {
    it.each([
      ['local', false],
      ['byok', false],
      ['hobby', false],
      ['pro', false],
      ['pro_plus', true],
      ['max', true],
    ] as const)('%s → %s', (tier, expected) => {
      useTierStore.getState().setTier(tier);
      expect(selectCanSwitchProvider(useTierStore.getState())).toBe(expected);
    });
  });

  describe('selectIsCrossProviderSwitch', () => {
    it('returns false when no conversation provider is set', () => {
      expect(selectIsCrossProviderSwitch(useTierStore.getState(), 'openai')).toBe(false);
    });

    it('returns false when nextProvider matches current', () => {
      useTierStore.getState().setCurrentConversationProvider('anthropic');
      expect(selectIsCrossProviderSwitch(useTierStore.getState(), 'anthropic')).toBe(false);
    });

    it('returns true when nextProvider differs (case-insensitive)', () => {
      useTierStore.getState().setCurrentConversationProvider('Anthropic');
      expect(selectIsCrossProviderSwitch(useTierStore.getState(), 'openai')).toBe(true);
      expect(selectIsCrossProviderSwitch(useTierStore.getState(), 'ANTHROPIC')).toBe(false);
    });
  });

  describe('selectProviderSwitchGate', () => {
    it('allows when no conversation active (first message)', () => {
      useTierStore.getState().setTier('byok');
      expect(selectProviderSwitchGate(useTierStore.getState(), 'openai')).toBe('allow');
    });

    it('allows when same provider', () => {
      useTierStore.setState({ tier: 'byok', currentConversationProvider: 'openai' });
      expect(selectProviderSwitchGate(useTierStore.getState(), 'openai')).toBe('allow');
    });

    it('upgrade-required for cross-provider on free/hobby/pro', () => {
      for (const tier of ['local', 'byok', 'hobby', 'pro'] as const) {
        useTierStore.setState({ tier, currentConversationProvider: 'anthropic' });
        expect(selectProviderSwitchGate(useTierStore.getState(), 'openai')).toBe(
          'upgrade-required',
        );
      }
    });

    it('allows cross-provider on pro_plus / max', () => {
      for (const tier of ['pro_plus', 'max'] as const) {
        useTierStore.setState({ tier, currentConversationProvider: 'anthropic' });
        expect(selectProviderSwitchGate(useTierStore.getState(), 'openai')).toBe('allow');
      }
    });
  });
});
