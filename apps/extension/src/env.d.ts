declare const process: {
  env: Record<string, string | undefined> & {
    CLERK_PUBLISHABLE_KEY?: string;
    CLERK_SYNC_HOST?: string;
  };
};

interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
