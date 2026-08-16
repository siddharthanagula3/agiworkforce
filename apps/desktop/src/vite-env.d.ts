interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WEB_APP_URL?: string;
  readonly VITE_GATEWAY_BASE_URL?: string;
  readonly VITE_STATUS_URL?: string;
  readonly VITE_DESKTOP_UI_DEV_LOCAL?: string;
  readonly VITE_DEV_ACCOUNT_PLAN?: string;
  readonly VITE_DEV_ACCOUNT_NAME?: string;
  readonly VITE_DEV_ACCOUNT_EMAIL?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_WDIO_E2E?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
