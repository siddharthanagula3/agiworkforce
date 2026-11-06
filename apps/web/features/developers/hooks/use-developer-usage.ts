'use client';

import type { DeveloperUsage } from '../types';
import { readDeveloperApiError } from './use-developer-projects';
import { useDeveloperQuery, type DeveloperQueryScope } from './use-developer-query';

export const DEVELOPER_USAGE_QUERY_KEY = ['developers', 'usage'] as const;

async function readDeveloperUsage({ request, headers }: DeveloperQueryScope): Promise<DeveloperUsage> {
  const response = await request.fetch('/api/developers/usage', {
    method: 'GET', cache: 'no-store', headers,
  });
  if (!response.ok) {
    throw new Error(await readDeveloperApiError(response, 'Usage could not be loaded.'));
  }
  return (await response.json()) as DeveloperUsage;
}

export function useDeveloperUsage() {
  return useDeveloperQuery(DEVELOPER_USAGE_QUERY_KEY, readDeveloperUsage);
}
