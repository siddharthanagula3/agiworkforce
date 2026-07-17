import {
  createManagedCloudProjectsClient,
  type ManagedCloudProjectsTransportRequest,
} from '@agiworkforce/cloud-contracts';
import { api } from './api';

async function requestJson(request: ManagedCloudProjectsTransportRequest): Promise<unknown> {
  switch (request.method) {
    case 'GET':
      return request.signal
        ? api.get<unknown>(request.path, { signal: request.signal })
        : api.get<unknown>(request.path);
    case 'POST':
      return request.signal
        ? api.post<unknown>(request.path, request.body, { signal: request.signal })
        : api.post<unknown>(request.path, request.body);
    case 'PUT':
      return request.signal
        ? api.put<unknown>(request.path, request.body, { signal: request.signal })
        : api.put<unknown>(request.path, request.body);
    case 'DELETE':
      return request.signal
        ? api.delete<unknown>(request.path, { signal: request.signal })
        : api.delete<unknown>(request.path);
  }
}

/**
 * Mobile transport adapter for the canonical Managed Cloud projects client.
 * `api` retains auth refresh, TLS pinning, timeout, and Local-mode egress guards;
 * the shared client owns paths, request shaping, and runtime response validation.
 */
export const managedCloudProjects = createManagedCloudProjectsClient({ requestJson });
