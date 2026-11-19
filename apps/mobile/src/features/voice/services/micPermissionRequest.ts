let pendingRequests = 0;

export function isMicPermissionRequestPending(): boolean {
  return pendingRequests > 0;
}

export async function trackMicPermissionRequest<T>(request: () => Promise<T>): Promise<T> {
  pendingRequests += 1;
  try {
    return await request();
  } finally {
    pendingRequests -= 1;
  }
}
