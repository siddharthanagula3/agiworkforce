declare const process: {
  env: Record<string, string | undefined> & {
    CLERK_PUBLISHABLE_KEY?: string;
    CLERK_SYNC_HOST?: string;
  };
};

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_AGI_WEB_API_BASE_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
