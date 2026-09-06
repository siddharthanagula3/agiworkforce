const MULTI_LABEL_PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'com.br',
  'co.jp',
  'co.in',
  'com.cn',
  'co.nz',
  'com.tr',
  'com.mx',
  'co.kr',
  'com.sg',
  'co.za',
  'com.ar',
  'com.hk',
  'co.id',
  'com.my',
  'com.ph',
  'com.vn',
  'com.tw',
  'com.ua',
  'com.pl',
  'com.eg',
  'com.ng',
  'co.il',
]);

export const HOSTING_PLATFORM_DOMAINS: readonly string[] = [
  'workers.dev',
  'vercel.app',
  'netlify.app',
  'railway.app',
  'onrender.com',
  'fly.dev',
  'herokuapp.com',
  'azurewebsites.net',
  'azure-api.net',
  'run.app',
  'appspot.com',
  'amazonaws.com',
  'cloudfront.net',
  'elasticbeanstalk.com',
  'github.io',
  'pages.dev',
  'trycloudflare.com',
  'cloudflareaccess.com',
  'ngrok-free.dev',
  'ngrok-free.app',
  'ngrok.io',
  'ngrok.app',
  'ngrok.dev',
  'replit.app',
  'replit.dev',
  'hf.space',
  'koyeb.app',
  'deno.dev',
  'val.run',
  'glitch.me',
  'modal.run',
  'pythonanywhere.com',
  'supabase.co',
  'convex.site',
  'convex.cloud',
  'firebaseapp.com',
  'web.app',
  'ondigitalocean.app',
  'zeabur.app',
  'duckdns.org',
  'dyndns-server.com',
  'dyndns.org',
  'no-ip.org',
  'loca.lt',
  'serveo.net',
];

export const CODE_FORGE_DOMAINS: readonly string[] = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
  'sr.ht',
  'gitee.com',
  'npmjs.com',
  'pypi.org',
  'readthedocs.io',
];

const TEMPLATE_HOST = /[{}]/u;

export function hostnameOf(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return TEMPLATE_HOST.test(hostname) ? null : hostname;
  } catch {
    return null;
  }
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  const keep = MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

export function secondLevelLabel(host: string): string {
  return registrableDomain(host).split('.')[0] ?? '';
}

export function hostMatchesDomain(host: string, domain: string): boolean {
  const lowered = host.toLowerCase();
  return lowered === domain || lowered.endsWith(`.${domain}`);
}

export function hostMatchesAnyDomain(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => hostMatchesDomain(host, domain));
}

export function isHostingPlatformHost(host: string): boolean {
  return hostMatchesAnyDomain(host, HOSTING_PLATFORM_DOMAINS);
}

export function isCodeForgeHost(host: string): boolean {
  return hostMatchesAnyDomain(host, CODE_FORGE_DOMAINS);
}

export function repositoryOwnerOf(repositoryUrl: string): string | null {
  try {
    const url = new URL(repositoryUrl);
    if (!isCodeForgeHost(url.hostname)) return null;
    return url.pathname.split('/').filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

export function repositoryOwnerUrl(repositoryUrl: string): string | null {
  const owner = repositoryOwnerOf(repositoryUrl);
  const origin = originOf(repositoryUrl);
  return owner && origin ? `${origin}/${owner}` : null;
}
