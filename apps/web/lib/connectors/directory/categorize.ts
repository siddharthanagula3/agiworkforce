export const DIRECTORY_CATEGORIES = [
  'Code',
  'Communication',
  'Data',
  'Design',
  'Financial services',
  'Health',
  'Legal',
  'Life sciences',
  'Productivity',
  'Sales and marketing',
  'Other',
] as const;

export type DirectoryCategory = (typeof DIRECTORY_CATEGORIES)[number];

const OTHER_CATEGORY: DirectoryCategory = 'Other';

type KeywordCategory = Exclude<DirectoryCategory, typeof OTHER_CATEGORY>;

const CATEGORY_KEYWORDS: Readonly<Record<KeywordCategory, readonly string[]>> = {
  Code: ['github', 'gitlab', 'code', ' ci ', 'deploy', 'api', 'developer', 'git', 'devops', 'sdk'],
  Communication: [
    'slack',
    'email',
    'mail',
    'chat',
    'sms',
    'messaging',
    'discord',
    'teams',
    'telephony',
  ],
  Data: [
    'analytics',
    'database',
    'sql',
    'dataset',
    'metrics',
    'dashboard',
    'warehouse',
    'etl',
    'data',
  ],
  Design: ['design', 'image', 'video', 'audio', 'creative', 'illustration', 'figma', 'canva'],
  'Financial services': [
    'payment',
    'invoice',
    'finance',
    'accounting',
    'bank',
    'billing',
    'ledger',
    'financial',
  ],
  Health: ['health', 'medical', 'clinical', 'patient', 'hospital', 'wellness'],
  Legal: ['legal', 'contract', 'compliance', 'law firm', 'regulatory'],
  'Life sciences': ['pharma', 'biotech', 'clinical trial', 'genomics', 'fhir', 'life sciences'],
  Productivity: [
    'task',
    'todo',
    'calendar',
    'note',
    'productivity',
    'project',
    'docs',
    'document',
    'workspace',
  ],
  'Sales and marketing': [
    'crm',
    'sales',
    'marketing',
    'lead',
    'campaign',
    'newsletter',
    'shop',
    'commerce',
    'store',
    'cart',
    'checkout',
    'inventory',
    'order',
    'retail',
  ],
};

const KEYWORD_CATEGORIES = Object.keys(CATEGORY_KEYWORDS) as readonly KeywordCategory[];

export function deriveDirectoryCategories(
  description: string,
  title?: string,
): DirectoryCategory[] {
  const haystack = ` ${title ?? ''} ${description} `.toLowerCase();
  const matches = KEYWORD_CATEGORIES.filter((category) =>
    CATEGORY_KEYWORDS[category].some((keyword) => haystack.includes(keyword)),
  );
  return matches.length > 0 ? matches : [OTHER_CATEGORY];
}
