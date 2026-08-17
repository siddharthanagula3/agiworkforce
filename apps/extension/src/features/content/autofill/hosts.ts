export interface AtsHostRule {
  host: string;
  path?: RegExp;
}

interface ParsedPageUrl {
  host: string;
  path: string;
}

function parsePageUrl(url: string): ParsedPageUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return null;
  return { host, path: parsed.pathname };
}

export function hostMatches(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

export function matchesAtsHostRules(url: string, rules: readonly AtsHostRule[]): boolean {
  const page = parsePageUrl(url);
  if (!page) return false;
  return rules.some(
    (rule) => hostMatches(page.host, rule.host) && (!rule.path || rule.path.test(page.path)),
  );
}
