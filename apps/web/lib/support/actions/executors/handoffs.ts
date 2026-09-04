/**
 * @file Executors for actions whose effect lives in an existing route.
 *
 * `export_account_data` and `open_billing_portal` already have audited,
 * rate-limited, session-scoped routes. Reimplementing either here would create
 * a second path to the same effect with a second set of guards to keep in sync,
 * and `/api/portal` is owned by another workflow this cycle.
 *
 * So this layer authorizes, records the attempt, and returns a SERVER-DEFINED
 * endpoint descriptor which the client invokes under the same session. The
 * descriptor is a constant in the registry. It never comes from the model, from
 * the client, or from a request body, the client cannot ask us to hand it a
 * URL of its choosing.
 *
 * COUPLING NOTE (flagged, not hidden): if `/api/portal`'s method or path
 * changes, this hand-off silently breaks and the widget shows a dead control.
 * `__tests__/handoff-endpoints.test.ts` asserts the descriptor still matches the
 * real route's exported method, which catches the common form of that drift.
 */

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
