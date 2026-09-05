import { describe, expect, it } from 'vitest';

import { PLACES_SEARCH_TOOL_NAME } from '@agiworkforce/types';

import { placesSearchToolDef } from './places-tool';
import {
  isRequiredPlacesToolChoice,
  resolvePlacesRequirement,
  resolveRequiredPlacesEnforcement,
} from './required-places';

const CONFIGURED = {
  toolsCapable: true,
  stream: true as boolean | undefined,
  backendConfigured: true,
};

describe('resolvePlacesRequirement', () => {
  it('offers and requires the tool for the reference place question', () => {
    expect(
      resolvePlacesRequirement({
        ...CONFIGURED,
        userMessage: 'best coffee near Union Square San Francisco open now',
      }),
    ).toEqual({ offered: true, required: true, unavailable: false, signal: 'proximity' });
  });

  it('offers but does not require the tool for the ambiguous locality signal', () => {
    expect(
      resolvePlacesRequirement({ ...CONFIGURED, userMessage: 'best coffee in San Francisco' }),
    ).toEqual({ offered: true, required: false, unavailable: false, signal: 'locality' });
  });

  it('stays out of a turn with no place wording', () => {
    expect(
      resolvePlacesRequirement({ ...CONFIGURED, userMessage: 'summarise this pull request' }),
    ).toEqual({ offered: false, required: false, unavailable: false, signal: null });
  });

  it('marks a place question unanswerable when the server has no places provider', () => {
    expect(
      resolvePlacesRequirement({
        ...CONFIGURED,
        backendConfigured: false,
        userMessage: 'pharmacies near me',
      }),
    ).toEqual({ offered: false, required: false, unavailable: true, signal: 'proximity' });
  });

  it('stays out of a non-streaming or tool-less request entirely', () => {
    for (const overrides of [{ stream: false }, { toolsCapable: false }]) {
      expect(
        resolvePlacesRequirement({
          ...CONFIGURED,
          ...overrides,
          userMessage: 'pharmacies near me',
        }),
      ).toEqual({ offered: false, required: false, unavailable: false, signal: null });
    }
  });
});

describe('resolveRequiredPlacesEnforcement', () => {
  const tools = [placesSearchToolDef()];

  it('forces the places tool on the first step', () => {
    const enforcement = resolveRequiredPlacesEnforcement({
      required: true,
      requestedToolChoice: undefined,
      model: undefined,
      tools,
    });

    expect(enforcement.mode).toBe('tool-choice');
    expect(enforcement.toolChoice).toEqual({
      type: 'function',
      function: { name: PLACES_SEARCH_TOOL_NAME },
    });
    expect(isRequiredPlacesToolChoice(enforcement.toolChoice)).toBe(true);
  });

  it('never overrides a tool choice the caller sent', () => {
    expect(
      resolveRequiredPlacesEnforcement({
        required: true,
        requestedToolChoice: 'none',
        model: undefined,
        tools,
      }).mode,
    ).toBe('none');
  });

  it('does nothing when the tool was never attached', () => {
    expect(
      resolveRequiredPlacesEnforcement({
        required: true,
        requestedToolChoice: undefined,
        model: undefined,
        tools: [],
      }).mode,
    ).toBe('none');
  });

  it('does nothing when the turn only earned an offer', () => {
    expect(
      resolveRequiredPlacesEnforcement({
        required: false,
        requestedToolChoice: undefined,
        model: undefined,
        tools,
      }).mode,
    ).toBe('none');
  });

  it('rejects a forced choice for another tool', () => {
    expect(isRequiredPlacesToolChoice({ type: 'function', function: { name: 'web_search' } })).toBe(
      false,
    );
    expect(isRequiredPlacesToolChoice('auto')).toBe(false);
    expect(isRequiredPlacesToolChoice(null)).toBe(false);
  });
});
