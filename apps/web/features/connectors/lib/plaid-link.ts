import {
  BankAccountsExchangeResponseSchema,
  BankAccountsLinkResponseSchema,
} from '@agiworkforce/cloud-contracts';
import { getCsrfToken } from '@/lib/client/csrf';
import { PLAID_LINK_SCRIPT_URL } from '@/lib/connectors/plaid-config';

export interface PlaidLinkRoutes {
  readonly linkPath: string;
  readonly exchangePath: string;
}

type HeaderBuilder = (base: Record<string, string>) => Promise<Record<string, string>>;

interface PlaidLinkExitError {
  readonly display_message?: string | null;
}

interface PlaidLinkSuccessMetadata {
  readonly institution?: { readonly name?: string | null } | null;
}

interface PlaidLinkHandler {
  open(): void;
  destroy(): void;
}

interface PlaidLinkFactory {
  create(config: {
    token: string;
    onSuccess(publicToken: string | null, metadata: PlaidLinkSuccessMetadata): void;
    onExit(error: PlaidLinkExitError | null): void;
  }): PlaidLinkHandler;
}

interface PlaidLinkResult {
  readonly publicToken: string;
  readonly institutionName: string | null;
}

type PlaidWindow = Window & { Plaid?: PlaidLinkFactory };

const JSON_CONTENT_TYPE = 'application/json';
const CSRF_HEADER = 'x-csrf-token';
const LOAD_FAILED = 'The bank sign-in window could not load. Check your connection and try again.';
const START_FAILED = 'Could not start connecting a bank account. Try again.';
const LINK_FAILED = 'The bank connection was not completed. Try again.';
const SAVE_FAILED = 'The bank account was linked but could not be saved. Try again.';

let plaidLoading: Promise<PlaidLinkFactory> | null = null;

const passHeaders: HeaderBuilder = async (base) => base;

function isSameOriginPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

export function plaidLinkRoutesOf(body: unknown): PlaidLinkRoutes | null {
  if (typeof body !== 'object' || body === null) return null;
  const { plaidLinkPath, plaidExchangePath } = body as {
    plaidLinkPath?: unknown;
    plaidExchangePath?: unknown;
  };
  return isSameOriginPath(plaidLinkPath) && isSameOriginPath(plaidExchangePath)
    ? { linkPath: plaidLinkPath, exchangePath: plaidExchangePath }
    : null;
}

function loadPlaidLink(): Promise<PlaidLinkFactory> {
  const loaded = (window as PlaidWindow).Plaid;
  if (loaded) return Promise.resolve(loaded);
  plaidLoading ??= new Promise<PlaidLinkFactory>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PLAID_LINK_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const factory = (window as PlaidWindow).Plaid;
      if (factory) resolve(factory);
      else reject(new Error(LOAD_FAILED));
    };
    script.onerror = () => reject(new Error(LOAD_FAILED));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    plaidLoading = null;
    throw error;
  });
  return plaidLoading;
}

function messageOf(body: unknown): string | null {
  const candidate = body as { error?: unknown; message?: unknown } | null;
  if (typeof candidate?.message === 'string') return candidate.message;
  if (typeof candidate?.error === 'string') return candidate.error;
  const nested = candidate?.error as { message?: unknown } | undefined;
  return typeof nested?.message === 'string' ? nested.message : null;
}

async function postJson(
  path: string,
  headers: HeaderBuilder,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; body: unknown }> {
  const csrfToken = await getCsrfToken();
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: await headers({ 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken }),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ok: response.ok, body: await response.json().catch(() => null) };
}

function runPlaidLink(factory: PlaidLinkFactory, token: string): Promise<PlaidLinkResult | null> {
  return new Promise((resolve, reject) => {
    const handler = factory.create({
      token,
      onSuccess: (publicToken, metadata) => {
        handler.destroy();
        if (publicToken) {
          resolve({ publicToken, institutionName: metadata.institution?.name ?? null });
        } else {
          reject(new Error(LINK_FAILED));
        }
      },
      onExit: (error) => {
        handler.destroy();
        if (error) reject(new Error(error.display_message ?? LINK_FAILED));
        else resolve(null);
      },
    });
    handler.open();
  });
}

export async function connectBankAccountsWithPlaid(
  routes: PlaidLinkRoutes,
  headers: HeaderBuilder = passHeaders,
): Promise<string | null> {
  const started = await postJson(routes.linkPath, headers);
  const link = BankAccountsLinkResponseSchema.safeParse(started.body);
  if (!started.ok || !link.success) {
    throw new Error(messageOf(started.body) ?? START_FAILED);
  }
  const linked = await runPlaidLink(await loadPlaidLink(), link.data.linkToken);
  if (!linked) return null;
  const saved = await postJson(routes.exchangePath, headers, {
    publicToken: linked.publicToken,
    ...(linked.institutionName ? { institutionName: linked.institutionName } : {}),
  });
  const connected = BankAccountsExchangeResponseSchema.safeParse(saved.body);
  if (!saved.ok || !connected.success) throw new Error(messageOf(saved.body) ?? SAVE_FAILED);
  return connected.data.connector.connectedAt;
}
