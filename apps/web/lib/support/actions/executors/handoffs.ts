import 'server-only';

import type { SupportActionDefinition } from '../registry';
import { SupportActionRefusal, type SupportActionResult } from '../types';

export function executeHandoff(definition: SupportActionDefinition): SupportActionResult {
  const endpoint = definition.endpoint;
  if (!endpoint) {
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_UNAVAILABLE',
      409,
      'That action is not available right now.',
    );
  }

  return {
    kind: 'handoff',
    message:
      definition.id === 'open_billing_portal'
        ? 'Opening the billing portal for your account.'
        : 'Starting your data export.',
    request: { method: endpoint.method, path: endpoint.path },
  };
}
