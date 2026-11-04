interface ClerkAuthFixture {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  sessionId: string | null;
  getToken: () => Promise<string | null>;
}

interface ClerkSessionFixture {
  id: string;
  user: { id: string };
  getToken: () => Promise<string | null>;
}

export function createClerkSessionFixture(
  readAuth: () => ClerkAuthFixture,
  methods: { signOut?: () => unknown } = {},
) {
  const clerk = {
    ...methods,
    loaded: false,
    user: null as { id: string } | null,
    session: null as ClerkSessionFixture | null,
  };

  function synchronize() {
    const auth = readAuth();
    clerk.loaded = auth.isLoaded;
    if (!auth.isLoaded || !auth.isSignedIn || !auth.userId || !auth.sessionId) {
      clerk.user = null;
      clerk.session = null;
    } else if (clerk.session?.id !== auth.sessionId || clerk.user?.id !== auth.userId) {
      const user = { id: auth.userId };
      clerk.user = user;
      clerk.session = { id: auth.sessionId, user, getToken: auth.getToken };
    }
    return auth;
  }

  return {
    useAuth: synchronize,
    useClerk: () => {
      synchronize();
      return clerk;
    },
  };
}
