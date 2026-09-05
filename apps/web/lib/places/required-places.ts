import 'server-only';

import {
  detectPlaceIntent,
  placeIntentForcesPlacesSearch,
  type PlaceIntentSignal,
} from '@agiworkforce/search';
import { PLACES_SEARCH_TOOL_NAME } from '@agiworkforce/types';

import {
  forcedFunctionToolChoice,
  hasGenericFunctionTool,
  isForcedToolChoiceFor,
  modelAcceptsForcedToolChoice,
} from '@/lib/required-tool-call';

export type PlacesRequirement = {
  offered: boolean;
  required: boolean;
  /**
   * A place question this server cannot answer with live data. Offering a tool
   * that can only fail buys nothing, but saying nothing produces the defect the
   * tool exists to prevent: a confident answer with remembered ratings and
   * opening hours.
   */
  unavailable: boolean;
  signal: PlaceIntentSignal | null;
};

const NOT_OFFERED: PlacesRequirement = {
  offered: false,
  required: false,
  unavailable: false,
  signal: null,
};

/**
 * Is this turn a place question, and is the place tool worth attaching?
 *
 * The tool is never offered from a menu, in either leader or here: the wording
 * of the question is the whole trigger. Attaching it costs a schema in the
 * request, so it is attached only when the wording earns it and the backend
 * can actually answer.
 */
export function resolvePlacesRequirement(input: {
  userMessage: string;
  toolsCapable: boolean;
  stream: boolean | undefined;
  backendConfigured: boolean;
}): PlacesRequirement {
  if (!input.toolsCapable || input.stream !== true) return NOT_OFFERED;

  const signal = detectPlaceIntent(input.userMessage);
  if (signal === null) return NOT_OFFERED;
  if (!input.backendConfigured) {
    return { offered: false, required: false, unavailable: true, signal };
  }

  return {
    offered: true,
    required: placeIntentForcesPlacesSearch(signal),
    unavailable: false,
    signal,
  };
}

export type RequiredPlacesEnforcementMode = 'tool-choice' | 'nudge' | 'none';

export type RequiredPlacesEnforcement = {
  mode: RequiredPlacesEnforcementMode;
  toolChoice?: { type: 'function'; function: { name: string } };
};

const NO_ENFORCEMENT: RequiredPlacesEnforcement = { mode: 'none' };

export const PLACES_UNAVAILABLE_SYSTEM_NOTICE =
  'Places search is unavailable on this server, so you have no live place data for this ' +
  'turn. Answer from general knowledge only, say plainly that you cannot check current ' +
  'ratings, opening hours or whether a place is open right now, and do not state any of ' +
  'those as fact.';

export const REQUIRED_PLACES_SYSTEM_NUDGE =
  'This turn is a question about real places. Call the places search tool before you ' +
  'answer, base the answer on what it returns, and state the local time the result was ' +
  'true for. Do not name places, ratings or opening hours from memory, and if the search ' +
  'returns nothing usable, say so plainly.';

/**
 * How to make the first model step search places: a tool choice where the
 * provider honours one, a system line where it does not. A caller-supplied
 * `tool_choice` always wins, overriding it would break an API client's own
 * contract.
 */
export function resolveRequiredPlacesEnforcement(input: {
  required: boolean;
  requestedToolChoice: unknown;
  model: string | undefined;
  tools: readonly unknown[] | undefined;
}): RequiredPlacesEnforcement {
  if (!input.required) return NO_ENFORCEMENT;
  if (input.requestedToolChoice !== undefined) return NO_ENFORCEMENT;
  if (!hasGenericFunctionTool(input.tools, PLACES_SEARCH_TOOL_NAME)) return NO_ENFORCEMENT;

  return modelAcceptsForcedToolChoice(input.model)
    ? { mode: 'tool-choice', toolChoice: forcedFunctionToolChoice(PLACES_SEARCH_TOOL_NAME) }
    : { mode: 'nudge' };
}

export function isRequiredPlacesToolChoice(choice: unknown): boolean {
  return isForcedToolChoiceFor(choice, PLACES_SEARCH_TOOL_NAME);
}
