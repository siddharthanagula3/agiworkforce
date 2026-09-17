'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAuthToken } from '@shared/lib/get-auth-token';

import type { EnterpriseContractResponse } from '@/app/api/settings/organization/billing-contract/route';

export const ENTERPRISE_CONTRACT_QUERY_KEY = ['workspace', 'enterprise-contract'] as const;

export function useEnterpriseContract(): UseQueryResult<EnterpriseContractResponse | null, Error> {
  return useQuery<EnterpriseContractResponse | null, Error>({
    queryKey: ENTERPRISE_CONTRACT_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch('/api/settings/organization/billing-contract', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(`Failed to load the enterprise contract (${res.status})`);
      return (await res.json()) as EnterpriseContractResponse;
    },
    staleTime: 5 * 60 * 1000,
    meta: { errorMessage: 'Failed to load the enterprise contract' },
  });
}
