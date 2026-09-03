export const DIRECTORY_CATEGORIES = [
  'Communication',
  'Productivity',
  'Development tools',
  'Data & Analytics',
  'Commerce & Shopping',
  'Creative',
  'Financial Services',
  'Sales and marketing',
  'Education',
  'Health & Life Sciences',
  'Travel',
  'Legal',
  'Media & Entertainment',
  'Other',
] as const;

export type DirectoryCategory = (typeof DIRECTORY_CATEGORIES)[number];

const OTHER_CATEGORY: DirectoryCategory = 'Other';

type KeywordCategory = Exclude<DirectoryCategory, typeof OTHER_CATEGORY>;

const CATEGORY_KEYWORDS: Readonly<Record<KeywordCategory, readonly string[]>> = {
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
  'Development tools': [
    'github',
    'gitlab',
    'code',
    ' ci ',
    'deploy',
    'api',
    'developer',
    'git',
    'devops',
    'sdk',
  ],
  'Data & Analytics': [
    'analytics',
    'database',
    'sql',
    'dataset',
    'metrics',
    'dashboard',
    'warehouse',
    'etl',
  ],
  'Commerce & Shopping': [
    'shop',
    'commerce',
    'store',
    'cart',
    'checkout',
    'inventory',
    'order',
    'retail',
  ],
  Creative: ['design', 'image', 'video', 'audio', 'creative', 'illustration', 'figma', 'canva'],
  'Financial Services': [
    'payment',
    'invoice',
    'finance',
    'accounting',
    'bank',
    'billing',
    'ledger',
  ],
  'Sales and marketing': ['crm', 'sales', 'marketing', 'lead', 'campaign', 'newsletter'],
  Education: ['learn', 'course', 'education', 'student', 'tutoring', 'quiz'],
  'Health & Life Sciences': ['health', 'medical', 'clinical', 'fhir', 'patient', 'pharma'],
  Travel: ['travel', 'flight', 'hotel', 'booking', 'itinerary', 'transit'],
  Legal: ['legal', 'contract', 'compliance', 'law firm', 'regulatory'],
  'Media & Entertainment': ['music', 'gaming', 'entertainment', 'streaming', 'podcast', 'film'],
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
