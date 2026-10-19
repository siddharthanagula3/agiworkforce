import { addCsrfHeaders } from '@/lib/client/csrf';

function sourcesPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/knowledge-files`;
}

export async function listRefreshableSources(projectId: string): Promise<ReadonlySet<string>> {
  try {
    const response = await fetch(`${sourcesPath(projectId)}/origins`, { credentials: 'include' });
    if (!response.ok) return new Set();
    const body = (await response.json()) as {
      origins?: Array<{ fileId: string; refreshable: boolean }>;
    };
    return new Set(
      (body.origins ?? []).filter((origin) => origin.refreshable).map((origin) => origin.fileId),
    );
  } catch {
    return new Set();
  }
}

export async function refreshProjectSource(
  projectId: string,
  fileId: string,
): Promise<{ status: 'unchanged' | 'refreshed' }> {
  const response = await fetch(`${sourcesPath(projectId)}/${encodeURIComponent(fileId)}/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders(),
  });
  const body = (await response.json().catch(() => ({}))) as {
    status?: string;
    error?: { message?: string } | string;
  };
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    throw new Error(message || 'The source could not be refreshed');
  }
  return { status: body.status === 'unchanged' ? 'unchanged' : 'refreshed' };
}
