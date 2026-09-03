const NEON_API_BASE = 'https://console.neon.tech/api/v2';
const BRANCH_READY_ATTEMPTS = 10;
const BRANCH_READY_RETRY_DELAY_MS = 3_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function authHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

async function readNeonError(response) {
  try {
    const body = await response.json();
    return body?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function createDrillBranch({
  apiKey,
  projectId,
  name,
  parentTimestamp,
  fetchImpl = fetch,
}) {
  const branch = { name };
  if (parentTimestamp) branch.parent_timestamp = parentTimestamp;

  const response = await fetchImpl(`${NEON_API_BASE}/projects/${projectId}/branches`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ branch, endpoints: [{ type: 'read_write' }] }),
  });

  if (!response.ok) {
    throw new Error(`Neon branch creation failed: ${await readNeonError(response)}`);
  }

  const body = await response.json();
  const branchId = body?.branch?.id;
  const connectionUri = body?.connection_uris?.[0]?.connection_uri;
  if (!branchId || !connectionUri) {
    throw new Error('Neon branch creation response is missing branch.id or connection_uris[0]');
  }

  return { branchId, connectionUri };
}

export async function deleteDrillBranch({ apiKey, projectId, branchId, fetchImpl = fetch }) {
  const response = await fetchImpl(`${NEON_API_BASE}/projects/${projectId}/branches/${branchId}`, {
    method: 'DELETE',
    headers: authHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(`Neon branch deletion failed: ${await readNeonError(response)}`);
  }
}

export async function waitUntilQueryable(
  queryImpl,
  {
    attempts = BRANCH_READY_ATTEMPTS,
    retryDelayMs = BRANCH_READY_RETRY_DELAY_MS,
    onRetry = () => {},
  } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await queryImpl('select 1');
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        onRetry(attempt, error);
        await delay(retryDelayMs);
      }
    }
  }
  throw lastError;
}
