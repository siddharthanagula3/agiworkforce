import { GITHUB_NAMESPACE_PREFIX } from '@/lib/connectors/directory/badge';

const BRAND_CASING: Readonly<Record<string, string>> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  paypal: 'PayPal',
  hubspot: 'HubSpot',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  ios: 'iOS',
  macos: 'macOS',
  watchos: 'watchOS',
  tvos: 'tvOS',
  openai: 'OpenAI',
  chatgpt: 'ChatGPT',
  langchain: 'LangChain',
  llamaindex: 'LlamaIndex',
  clickup: 'ClickUp',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  wordpress: 'WordPress',
  sharepoint: 'SharePoint',
  onedrive: 'OneDrive',
  onenote: 'OneNote',
  quickbooks: 'QuickBooks',
  sendgrid: 'SendGrid',
  pagerduty: 'PagerDuty',
  circleci: 'CircleCI',
  digitalocean: 'DigitalOcean',
  elevenlabs: 'ElevenLabs',
  posthog: 'PostHog',
  huggingface: 'HuggingFace',
  bigquery: 'BigQuery',
  mongodb: 'MongoDB',
  postgresql: 'PostgreSQL',
  postgres: 'Postgres',
  mysql: 'MySQL',
  graphql: 'GraphQL',
  devops: 'DevOps',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  nodejs: 'Node.js',
  nextjs: 'Next.js',
  vuejs: 'Vue.js',
  dotnet: '.NET',
  duckdb: 'DuckDB',
  clickhouse: 'ClickHouse',
  couchdb: 'CouchDB',
  dynamodb: 'DynamoDB',
  cosmosdb: 'CosmosDB',
  influxdb: 'InfluxDB',
  neo4j: 'Neo4j',
  opensearch: 'OpenSearch',
  elasticsearch: 'Elasticsearch',
  okx: 'OKX',
  npm: 'npm',
  pypi: 'PyPI',
  k8s: 'K8s',
  kubernetes: 'Kubernetes',
  argocd: 'ArgoCD',
  adb: 'ADB',
  ai: 'AI',
  api: 'API',
  apis: 'APIs',
  db: 'DB',
  os: 'OS',
  ui: 'UI',
  ux: 'UX',
  id: 'ID',
  ip: 'IP',
  ml: 'ML',
  nlp: 'NLP',
  ocr: 'OCR',
  pdf: 'PDF',
  pdfs: 'PDFs',
  csv: 'CSV',
  sql: 'SQL',
  seo: 'SEO',
  crm: 'CRM',
  erp: 'ERP',
  hr: 'HR',
  faq: 'FAQ',
  cli: 'CLI',
  sdk: 'SDK',
  cdn: 'CDN',
  dns: 'DNS',
  ssh: 'SSH',
  ssl: 'SSL',
  tls: 'TLS',
  vpn: 'VPN',
  aws: 'AWS',
  gcp: 'GCP',
  iot: 'IoT',
  llm: 'LLM',
  llms: 'LLMs',
  rag: 'RAG',
  mcp: 'MCP',
  ci: 'CI',
  js: 'JS',
  ts: 'TS',
  css: 'CSS',
  html: 'HTML',
  url: 'URL',
  urls: 'URLs',
  uri: 'URI',
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  rss: 'RSS',
  fhir: 'FHIR',
  fda: 'FDA',
  cve: 'CVE',
  sbom: 'SBOM',
  nft: 'NFT',
  nfts: 'NFTs',
  defi: 'DeFi',
  btc: 'BTC',
  eth: 'ETH',
  usd: 'USD',
  usdc: 'USDC',
  fx: 'FX',
  kpi: 'KPI',
  okr: 'OKR',
  b2b: 'B2B',
  b2c: 'B2C',
  saas: 'SaaS',
  iam: 'IAM',
  sso: 'SSO',
  rbac: 'RBAC',
  tv: 'TV',
  '3d': '3D',
  '2d': '2D',
  ar: 'AR',
  vr: 'VR',
  gpt: 'GPT',
  gpu: 'GPU',
  cpu: 'CPU',
  vs: 'VS',
  vscode: 'VS Code',
  http: 'HTTP',
  https: 'HTTPS',
  oauth: 'OAuth',
  sms: 'SMS',
  voip: 'VoIP',
  gis: 'GIS',
  gdpr: 'GDPR',
  hipaa: 'HIPAA',
  eu: 'EU',
  us: 'US',
  uk: 'UK',
  nyc: 'NYC',
  uspto: 'USPTO',
  sec: 'SEC',
  irs: 'IRS',
  nasa: 'NASA',
  cia: 'CIA',
  ibm: 'IBM',
  sap: 'SAP',
  amd: 'AMD',
  nvidia: 'NVIDIA',
  jira: 'Jira',
  atlassian: 'Atlassian',
  tradingview: 'TradingView',
  coinmarketcap: 'CoinMarketCap',
  coingecko: 'CoinGecko',
  alphavantage: 'Alpha Vantage',
  arxiv: 'arXiv',
  pubmed: 'PubMed',
  wikipedia: 'Wikipedia',
  x402: 'x402',
  fastapi: 'FastAPI',
  fastmcp: 'FastMCP',
  supabase: 'Supabase',
  firebase: 'Firebase',
  cloudflare: 'Cloudflare',
  microsoft: 'Microsoft',
  google: 'Google',
  gmail: 'Gmail',
  ansible: 'Ansible',
  awx: 'AWX',
  resharper: 'ReSharper',
  jxbrowser: 'JxBrowser',
  comfyui: 'ComfyUI',
  mikrotik: 'MikroTik',
  routeros: 'RouterOS',
};

const LEADING_DROPPED_TOKENS: ReadonlySet<string> = new Set(['mcp', 'mcpserver']);
const TRAILING_DROPPED_TOKENS: ReadonlySet<string> = new Set([
  'mcp',
  'mcpserver',
  'server',
  'servers',
  'remote',
  'hosted',
]);
const GENERIC_TOKENS: ReadonlySet<string> = new Set([
  'mcp',
  'server',
  'servers',
  'tools',
  'tool',
  'api',
  'docs',
  'remote',
  'cli',
  'sdk',
  'app',
  'service',
  'services',
  'agent',
  'agents',
  'integration',
  'connector',
  'plugin',
  'official',
  'hosted',
  'main',
  'index',
  'default',
  'core',
  'client',
  'public',
  'search',
  'gateway',
  'rpc',
]);
const MOJIBAKE_EM_DASHES: readonly string[] = ['ג€”', 'â€”', 'â€“'];
const EM_DASH_CODE_POINT = 0x2014;
const EN_DASH_CODE_POINT = 0x2013;
const EM_DASH = String.fromCodePoint(EM_DASH_CODE_POINT);
const DASH_LIKE_CLASS = `[${String.fromCodePoint(EN_DASH_CODE_POINT)}${EM_DASH}]`;
const DASH_LIKE = new RegExp(`\\s*${DASH_LIKE_CLASS}\\s*`, 'gu');
const NAME_DASH_REPLACEMENT = ' - ';
const HEX_LIKE_TOKEN = /^(?=.*\d)[a-f0-9]{8,}$/iu;
const HAS_INNER_UPPERCASE = /^.+[A-Z]/u;
const TOKEN_SEPARATORS = /[-_./\s]+/u;
const TITLE_SEPARATOR = /\s+[-|]\s+|:\s+/u;
const LEADING_PARENTHETICAL = /^\([^)]*\)\s*/u;
const LEADING_SYMBOLS = /^[^\p{L}\p{N}.]+/u;
const LEADING_DOT = /^\.+/u;
const DOT_PREFIXED_BRANDS: ReadonlySet<string> = new Set(['.net']);
const MCP_TOKEN = /[([]?\bmcp\b(?:\s+for\s+ai\s+agents|\s+servers?)?[)\]]?/giu;
const EDGE_SEPARATORS = /^[\s\-_:|,&+]+|[\s\-_:|,&+]+$/gu;
const UNCLOSED_PARENTHETICAL = /\s*\([^)]*$/u;
const TRAILING_STOPWORD = /\s+(?:a|an|and|at|by|for|from|in|of|on|or|the|to|vs|with)$/iu;
const LOWERCASE_SLUG_CHUNK = /\b[a-z0-9]+(?:[-_][a-z0-9]+)+\b/gu;
const LOWERCASE_WORDS = /^[a-z0-9]+(?:[-_ ][a-z0-9]+)*$/u;
const WHITESPACE_RUN = /\s+/gu;
const MAX_TITLE_LENGTH = 60;
const MAX_NAME_LENGTH = 40;
const MIN_TITLE_HEAD_LENGTH = 2;
const SPACE = ' ';

function normalizeDashes(value: string): string {
  let result = value;
  for (const sequence of MOJIBAKE_EM_DASHES) result = result.split(sequence).join(EM_DASH);
  return result.replace(DASH_LIKE, NAME_DASH_REPLACEMENT);
}

export function caseToken(token: string): string {
  const lowered = token.toLowerCase();
  const known = BRAND_CASING[lowered];
  if (known) return known;
  if (HAS_INNER_UPPERCASE.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function caseTokens(value: string): string {
  return value.split(TOKEN_SEPARATORS).filter(Boolean).map(caseToken).join(' ');
}

function stripLeadingNoise(value: string): string {
  const withoutSymbols = value.replace(LEADING_PARENTHETICAL, '').replace(LEADING_SYMBOLS, '');
  const firstToken = withoutSymbols.split(WHITESPACE_RUN)[0]?.toLowerCase() ?? '';
  return DOT_PREFIXED_BRANDS.has(firstToken)
    ? withoutSymbols
    : withoutSymbols.replace(LEADING_DOT, '');
}

function stripMcpTokens(value: string): string {
  return value
    .replace(MCP_TOKEN, SPACE)
    .replace(WHITESPACE_RUN, SPACE)
    .replace(EDGE_SEPARATORS, '');
}

function caseTitle(value: string): string {
  return LOWERCASE_WORDS.test(value)
    ? caseTokens(value)
    : value.replace(LOWERCASE_SLUG_CHUNK, (chunk) => caseTokens(chunk));
}

function capName(value: string): string {
  if (value.length <= MAX_NAME_LENGTH) return value;
  const window = value.slice(0, MAX_NAME_LENGTH);
  const boundary =
    value.charAt(MAX_NAME_LENGTH) === SPACE ? MAX_NAME_LENGTH : window.lastIndexOf(SPACE);
  const capped = boundary >= MIN_TITLE_HEAD_LENGTH ? window.slice(0, boundary) : window;
  return capped
    .replace(UNCLOSED_PARENTHETICAL, '')
    .replace(TRAILING_STOPWORD, '')
    .replace(EDGE_SEPARATORS, '');
}

export interface DisplayTitle {
  readonly name: string;
  readonly tagline: string;
}

export function splitRegistryTitle(title: string): DisplayTitle {
  const normalized = stripLeadingNoise(
    normalizeDashes(title).replace(WHITESPACE_RUN, SPACE).trim(),
  );
  const separator = normalized.match(TITLE_SEPARATOR);
  const splitAt =
    separator?.index !== undefined && separator.index >= MIN_TITLE_HEAD_LENGTH
      ? separator.index
      : normalized.length;
  const head = normalized.slice(0, splitAt);
  const tagline =
    splitAt < normalized.length ? normalized.slice(splitAt + (separator?.[0].length ?? 0)) : '';
  const cleaned = caseTitle(stripLeadingNoise(stripMcpTokens(head)));
  const name = cleaned.length > MAX_TITLE_LENGTH ? '' : capName(cleaned);
  return { name, tagline: tagline.trim() };
}

export function cleanRegistryTitle(title: string): string {
  return splitRegistryTitle(title).name;
}

function namespaceLabels(namespace: string): ReadonlySet<string> {
  const source = namespace.startsWith(GITHUB_NAMESPACE_PREFIX)
    ? namespace.slice(GITHUB_NAMESPACE_PREFIX.length)
    : namespace;
  return new Set(
    source
      .split(TOKEN_SEPARATORS)
      .filter(Boolean)
      .map((label) => label.toLowerCase()),
  );
}

export function publisherLeafLabel(namespace: string): string {
  if (namespace.startsWith(GITHUB_NAMESPACE_PREFIX)) {
    return namespace.slice(GITHUB_NAMESPACE_PREFIX.length);
  }
  const labels = namespace.split('.').filter(Boolean);
  return labels.length > 1 ? (labels[1] ?? namespace) : namespace;
}

function idTokens(leaf: string): string[] {
  return leaf
    .split(TOKEN_SEPARATORS)
    .filter(Boolean)
    .filter((token) => !HEX_LIKE_TOKEN.test(token))
    .filter((token) => !LEADING_DROPPED_TOKENS.has(token.toLowerCase()));
}

export function deriveNameFromRegistryId(registryName: string): string {
  const slash = registryName.indexOf('/');
  const namespace = slash === -1 ? registryName : registryName.slice(0, slash);
  const leaf = slash === -1 ? '' : registryName.slice(slash + 1);
  const owner = namespaceLabels(namespace);
  const publisherLabel = caseTokens(publisherLeafLabel(namespace));

  const tokens = idTokens(leaf);
  while (
    tokens.length > 0 &&
    TRAILING_DROPPED_TOKENS.has(tokens[tokens.length - 1]?.toLowerCase() ?? '')
  ) {
    tokens.pop();
  }
  while (tokens.length > 1 && owner.has(tokens[0]?.toLowerCase() ?? '')) tokens.shift();

  if (tokens.length === 0) return publisherLabel;
  const allGeneric = tokens.every((token) => GENERIC_TOKENS.has(token.toLowerCase()));
  const cased = tokens.map(caseToken).join(' ');
  return allGeneric ? `${publisherLabel} ${cased}` : cased;
}

export function deriveDisplayTitle(registryName: string, title: string | undefined): DisplayTitle {
  const trimmed = title?.trim() ?? '';
  const fromId = capName(deriveNameFromRegistryId(registryName));
  if (!trimmed || trimmed === registryName) return { name: fromId, tagline: '' };
  const split = splitRegistryTitle(trimmed);
  return { name: split.name || fromId, tagline: split.tagline };
}

export function deriveDisplayName(registryName: string, title: string | undefined): string {
  return deriveDisplayTitle(registryName, title).name;
}
