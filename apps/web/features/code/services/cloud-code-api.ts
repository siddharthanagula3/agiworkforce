'use client';

import { createManagedCloudCodeApi, type CloudCodeApi } from '@agiworkforce/cloud-contracts';
import { getCsrfToken as getBrowserCsrfToken } from '@/lib/client/csrf';

interface CloudCodeApiDependencies {
  fetchImpl?: typeof fetch;
  getCsrfToken?: () => Promise<string>;
}

export function createCloudCodeApi(dependencies: CloudCodeApiDependencies = {}): CloudCodeApi {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const getCsrfToken = dependencies.getCsrfToken ?? getBrowserCsrfToken;
  return createManagedCloudCodeApi({
    fetchImpl: (path, init) => fetchImpl(path, { credentials: 'include', ...init }),
    mutationHeaders: async () => ({ 'x-csrf-token': await getCsrfToken() }),
  });
}

export const cloudCodeApi = createCloudCodeApi();
