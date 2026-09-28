'use client';

import { useQuery } from '@tanstack/react-query';

import { sendAuthorizedJson } from '@features/auth/step-up-fetch';

import type { DeveloperUsage } from '../types';
import { readDeveloperApiError } from './use-developer-projects';

export const DEVELOPER_USAGE_QUERY_KEY = ['developers', 'usage'] as const;

export function useDeveloperUsage() {
  return useQuery<DeveloperUsage, Error>({
    queryKey: DEVELOPER_USAGE_QUERY_KEY,
    queryFn: async () => {
      const response = await sendAuthorizedJson('/api/developers/usage', { method: 'GET' });
      if (!response.ok) {
        throw new Error(await readDeveloperApiError(response, 'Usage could not be loaded.'));
      }
      return (await response.json()) as DeveloperUsage;
    },
  });
}
