import 'server-only';

import type { PlaceRecord } from '@agiworkforce/types';

export interface PlacesSearchQuery {
  query: string;
  near?: string;
  openNow?: boolean;
  limit: number;
  languageCode?: string;
  signal?: AbortSignal;
}

export type PlacesErrorCode =
  | 'invalid_tool_input'
  | 'not_configured'
  | 'upstream_error'
  | 'timeout'
  | 'cancelled';

/**
 * `billableCalls` is the number of upstream requests this outcome actually
 * bought, so the ledger records what was spent rather than what was asked for.
 * An unconfigured provider and a rejected argument both cost nothing.
 */
export type PlacesSearchOutcome =
  | {
      ok: true;
      providerId: string;
      attribution: string;
      places: PlaceRecord[];
      billableCalls: number;
    }
  | {
      ok: false;
      providerId: string;
      errorCode: PlacesErrorCode;
      error: string;
      billableCalls: number;
    };

export interface PlacesProvider {
  readonly id: string;
  readonly attribution: string;
  configured(): boolean;
  search(request: PlacesSearchQuery): Promise<PlacesSearchOutcome>;
}

export function placesError(
  providerId: string,
  errorCode: PlacesErrorCode,
  error: string,
): PlacesSearchOutcome {
  return { ok: false, providerId, errorCode, error, billableCalls: 0 };
}
