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
      termsUrl?: string;
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

export interface PlacesPhotoRequest {
  reference: string;
  maxWidthPx: number;
  signal?: AbortSignal;
}

export type PlacesPhotoOutcome =
  | { ok: true; body: ArrayBuffer; contentType: string }
  | { ok: false; errorCode: PlacesErrorCode };

export interface PlacesProvider {
  readonly id: string;
  readonly attribution: string;
  readonly termsUrl?: string;
  configured(): boolean;
  search(request: PlacesSearchQuery): Promise<PlacesSearchOutcome>;
  /**
   * A place photo is behind the provider's key, so the browser can never fetch
   * one directly. Returning bytes rather than a URL keeps the key, the vendor
   * host and the redirect chain on this side of the port.
   */
  photo(request: PlacesPhotoRequest): Promise<PlacesPhotoOutcome>;
}

export function placesError(
  providerId: string,
  errorCode: PlacesErrorCode,
  error: string,
): PlacesSearchOutcome {
  return { ok: false, providerId, errorCode, error, billableCalls: 0 };
}
