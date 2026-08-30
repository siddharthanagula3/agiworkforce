const DEFAULT_INSECURE_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

export const ALLOWED_MANAGED_PROVIDER_HOSTS: ReadonlySet<string> = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.x.ai',
  'dashscope.aliyuncs.com',
  // Alibaba's international Model Studio deployment. A QwenCloud key is issued
  // against exactly one of the two scopes, so an operator outside the Chinese
  // mainland must be able to point QWEN_BASE_URL here — without this the
  // override is refused as SSRF and Qwen is unusable for them.
  'dashscope-intl.aliyuncs.com',
  'api.mulerouter.ai',
  'api.moonshot.cn',
  'api.moonshot.ai',
  'api.deepseek.com',
  'api.perplexity.ai',
  'open.bigmodel.cn',
  'api.minimax.io',
  'openrouter.ai',
  'gateway.ai.cloudflare.com',
  'ai-gateway.vercel.sh',
  'localhost',
  '127.0.0.1',
]);

export interface ValidateBaseUrlOptions {
  allowedHosts: ReadonlySet<string> | readonly string[];
  allowInsecureHosts?: readonly string[];
}

export type ValidateBaseUrlResult =
  | { ok: true; url: string; hostname: string }
  | {
      ok: false;
      reason: 'empty' | 'invalid-url' | 'insecure-protocol' | 'host-not-allowlisted';
      input: string;
      hostname?: string;
    };

function toLowercaseHostSet(hosts: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  const set = hosts instanceof Set ? hosts : new Set(hosts);
  return new Set([...set].map((h) => h.toLowerCase()));
}

export function validateBaseUrl(
  candidate: string | undefined | null,
  options: ValidateBaseUrlOptions,
): ValidateBaseUrlResult {
  const input = candidate ?? '';
  if (!input.trim()) {
    return { ok: false, reason: 'empty', input };
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: 'invalid-url', input };
  }

  const hostname = parsed.hostname.toLowerCase();
  const insecureAllowed = new Set(
    (options.allowInsecureHosts ?? DEFAULT_INSECURE_HOSTS).map((h) => h.toLowerCase()),
  );
  if (parsed.protocol !== 'https:' && !insecureAllowed.has(hostname)) {
    return { ok: false, reason: 'insecure-protocol', input, hostname };
  }

  const allowlist = toLowercaseHostSet(options.allowedHosts);
  if (!allowlist.has(hostname)) {
    return { ok: false, reason: 'host-not-allowlisted', input, hostname };
  }

  return { ok: true, url: input, hostname };
}

export function resolveValidatedBaseUrl(
  candidate: string | undefined | null,
  defaultUrl: string,
  options: ValidateBaseUrlOptions,
): { url: string; rejected?: Extract<ValidateBaseUrlResult, { ok: false }> } {
  if (!candidate) {
    return { url: defaultUrl };
  }
  const result = validateBaseUrl(candidate, options);
  if (result.ok) {
    return { url: result.url };
  }
  return { url: defaultUrl, rejected: result };
}
