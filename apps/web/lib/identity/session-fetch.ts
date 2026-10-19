'use client';

import { refreshIdentitySession } from './token';

/** A cookie-authenticated fetch that refreshes the session once on a 401 before giving up. */
export async function fetchRefreshingSession(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401 || !(await refreshIdentitySession())) return response;
  return fetch(input, init);
}
