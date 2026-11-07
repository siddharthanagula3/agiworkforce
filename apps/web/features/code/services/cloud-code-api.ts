'use client';

import { createManagedCloudCodeApi, type CloudCodeApi } from '@agiworkforce/cloud-contracts';
import { getCsrfToken as getBrowserCsrfToken } from '@/lib/client/csrf';
import type { RequestAuthority } from '@/lib/identity/request-authority';

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

export function createOwnedCloudCodeApi(
  captureAuthority: () => RequestAuthority,
  injectedApi?: CloudCodeApi,
): CloudCodeApi {
  function owned<Args extends unknown[], Result>(
    select: (api: CloudCodeApi) => (...args: Args) => Promise<Result>,
  ): (...args: Args) => Promise<Result> {
    return async (...args) => {
      const authority = captureAuthority();
      try {
        authority.assertCurrent();
        const client = injectedApi ?? createManagedCloudCodeApi({ fetchImpl: authority.fetch });
        const result = await select(client).apply(client, args);
        authority.assertCurrent();
        return result;
      } catch (error) {
        authority.assertCurrent();
        throw error;
      } finally {
        authority.retire();
      }
    };
  }

  return {
    list: owned((api) => api.list),
    listRepositories: owned((api) => api.listRepositories),
    listBranches: owned((api) => api.listBranches),
    get: owned((api) => api.get),
    create: owned((api) => api.create),
    run: owned((api) => api.run),
    changes: owned((api) => api.changes),
    createPullRequest: owned((api) => api.createPullRequest),
    pullRequestStatus: owned((api) => api.pullRequestStatus),
    close: owned((api) => api.close),
    rename: owned((api) => api.rename),
    setArchived: owned((api) => api.setArchived),
    setSharing: owned((api) => api.setSharing),
    openShared: owned((api) => api.openShared),
    deleteSession: owned((api) => api.deleteSession),
    commit: owned((api) => api.commit),
    discardChanges: owned((api) => api.discardChanges),
    startAgentTurn: owned((api) => api.startAgentTurn),
    cancelAgentTurn: owned((api) => api.cancelAgentTurn),
    listApprovals: owned((api) => api.listApprovals),
    decideApproval: owned((api) => api.decideApproval),
  };
}
