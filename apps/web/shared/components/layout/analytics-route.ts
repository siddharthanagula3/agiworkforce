export const DYNAMIC_PAGE_ROUTES = [
  '/blog/[slug]',
  '/chat/[sessionId]',
  '/chat/from-share/[token]',
  '/chat/projects/[id]',
  '/code/[sessionId]',
  '/connect/[deviceType]',
  '/help/[slug]',
  '/open/[target]/[id]',
  '/pair/[code]',
  '/plugins/[id]',
  '/quick-ask/[sessionId]',
  '/settings/[section]',
  '/share/[token]',
  '/shared-artifact/[token]',
  '/upgrade/[plan]',
  '/use-cases/[slug]',
] as const;

export const STATIC_SEGMENTS_BESIDE_PARAMS: Readonly<Record<string, readonly string[]>> = {
  '/chat': [
    'artifacts',
    'code',
    'customize',
    'from-share',
    'library',
    'projects',
    'schedules',
    'study',
  ],
  '/settings': [
    'account',
    'archived',
    'billing',
    'capabilities',
    'connections',
    'deleted-chats',
    'general',
    'memory',
    'notifications',
    'privacy',
    'profile',
    'reflect',
    'safety',
    'security',
    'shared-links',
    'team',
    'time-focus',
    'usage',
    'voice',
  ],
};

export const UNMATCHED_SEGMENTS = '[unmatched]';

const isParam = (segment: string) => /^\[[^\]]+\]$/.test(segment);

const TEMPLATES = DYNAMIC_PAGE_ROUTES.map((route) => route.split('/').slice(1)).sort(
  (a, b) => b.length - a.length,
);

function segmentsOf(pathname: string): string[] {
  return pathname.split(/[?#]/u)[0]!.split('/').filter(Boolean);
}

function matchesPrefix(template: readonly string[], segments: readonly string[]): boolean {
  return template.every((part, index) => {
    const segment = segments[index];
    if (segment === undefined) return false;
    if (!isParam(part)) return segment === part;
    const parent = `/${template.slice(0, index).join('/')}`;
    return !STATIC_SEGMENTS_BESIDE_PARAMS[parent]?.includes(segment);
  });
}

// The route a pathname was served by, each dynamic segment put back as its [name],
// so a share token, pairing code or conversation id is never reported as a page.
export function canonicalRoutePath(pathname: string): string {
  const segments = segmentsOf(pathname);
  const exact = TEMPLATES.find(
    (template) => template.length === segments.length && matchesPrefix(template, segments),
  );
  if (exact) return `/${exact.join('/')}`;
  const prefix = TEMPLATES.find(
    (template) => template.length < segments.length && matchesPrefix(template, segments),
  );
  if (prefix) return `/${[...prefix, UNMATCHED_SEGMENTS].join('/')}`;
  return `/${segments.join('/')}`;
}
