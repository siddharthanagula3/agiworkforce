let _clerkInstance: { session: { getToken: () => Promise<string | null> } | null } | null = null;

export async function getAuthToken(): Promise<string | null> {
  try {
    if (!_clerkInstance) {
      await import('@clerk/nextjs');
      if (
        typeof window !== 'undefined' &&
        (window as unknown as Record<string, unknown>)['Clerk']
      ) {
        _clerkInstance = (window as unknown as Record<string, unknown>)[
          'Clerk'
        ] as typeof _clerkInstance;
      }
    }
    return (await _clerkInstance?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}
