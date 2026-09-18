export const HELP_CONTEXTS = [
  'billing',
  'work',
  'connectors',
  'workspace-admin',
  'operator',
  'troubleshooting',
] as const;

export type HelpContext = (typeof HELP_CONTEXTS)[number];

export interface HelpEntryPoint {
  context: HelpContext;
  label: string;
  docId: string;
  query: string;
}

const ENTRY_POINTS: Readonly<Record<HelpContext, HelpEntryPoint>> = Object.freeze({
  billing: {
    context: 'billing',
    label: 'Help with billing',
    docId: 'billing-and-plans',
    query: 'billing plans invoices credits',
  },
  work: {
    context: 'work',
    label: 'Help with Work',
    docId: 'agi-work',
    query: 'agi work tasks runs',
  },
  connectors: {
    context: 'connectors',
    label: 'Help with connectors',
    docId: 'connectors-and-mcp',
    query: 'connectors mcp authorize',
  },
  'workspace-admin': {
    context: 'workspace-admin',
    label: 'Help with workspace administration',
    docId: 'workspace-administration',
    query: 'workspace administration members policy',
  },
  operator: {
    context: 'operator',
    label: 'Operator handbook',
    docId: 'troubleshooting',
    query: 'troubleshooting contact support escalation',
  },
  troubleshooting: {
    context: 'troubleshooting',
    label: 'Troubleshooting',
    docId: 'troubleshooting',
    query: 'troubleshooting error not working',
  },
});

export const HELP_CENTRE_PATH = '/help';

export function helpEntryPoint(context: HelpContext): HelpEntryPoint {
  return ENTRY_POINTS[context];
}

export function helpHref(context: HelpContext): string {
  return `${HELP_CENTRE_PATH}?q=${encodeURIComponent(ENTRY_POINTS[context].query)}`;
}

export function helpEntryPoints(): readonly HelpEntryPoint[] {
  return HELP_CONTEXTS.map((context) => ENTRY_POINTS[context]);
}

const CONTEXT_BY_PATH_PREFIX: readonly (readonly [string, HelpContext])[] = [
  ['/billing', 'billing'],
  ['/upgrade', 'billing'],
  ['/agi-work', 'work'],
  ['/tasks', 'work'],
  ['/connectors', 'connectors'],
  ['/plugins', 'connectors'],
  ['/workspace', 'workspace-admin'],
  ['/admin', 'workspace-admin'],
  ['/operator', 'operator'],
];

/** Which help a person on this route is most likely to be looking for. */
export function helpContextForPath(pathname: string | null | undefined): HelpContext | null {
  if (!pathname) return null;
  for (const [prefix, context] of CONTEXT_BY_PATH_PREFIX) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return context;
  }
  return null;
}

export function helpHrefForPath(pathname: string | null | undefined): string {
  const context = helpContextForPath(pathname);
  return context ? helpHref(context) : HELP_CENTRE_PATH;
}
