import 'server-only';

import { EXCLUDED_SUPPORT_ACTIONS } from './excluded';
import { SUPPORT_ACTIONS } from './registry';
import { SUPPORT_ACTION_IDS, type SupportActionId, type SupportActionOption } from './types';

export function listAvailableSupportActions(): {
  actions: SupportActionOption[];
  unavailable: { id: SupportActionId; reason: string }[];
  excluded: { id: string; reason: string; control: { label: string; href: string } }[];
} {
  const actions: SupportActionOption[] = [];
  const unavailable: { id: SupportActionId; reason: string }[] = [];

  for (const id of SUPPORT_ACTION_IDS) {
    const definition = SUPPORT_ACTIONS[id];
    const availability = definition.resolveAvailability();
    if (availability.available) {
      actions.push({ id, title: definition.title, description: definition.description });
    } else {
      unavailable.push({ id, reason: availability.reason ?? 'Not available in this deployment.' });
    }
  }

  return {
    actions,
    unavailable,
    excluded: Object.values(EXCLUDED_SUPPORT_ACTIONS).map((entry) => ({
      id: entry.id,
      reason: entry.reason,
      control: { ...entry.control },
    })),
  };
}
