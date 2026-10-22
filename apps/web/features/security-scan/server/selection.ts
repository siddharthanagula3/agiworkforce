import { SECURITY_SCAN_SCOPE_MAX_LENGTH } from '@agiworkforce/cloud-contracts';

const REGULAR_FILE_MODES = new Set(['100644', '100755']);

const SOURCE_EXTENSIONS = new Set([
  'c',
  'cc',
  'cjs',
  'cpp',
  'cs',
  'cts',
  'ex',
  'exs',
  'go',
  'h',
  'hpp',
  'java',
  'js',
  'jsx',
  'kt',
  'kts',
  'lua',
  'mjs',
  'mts',
  'php',
  'pl',
  'py',
  'rb',
  'rs',
  'scala',
  'sh',
  'sql',
  'svelte',
  'swift',
  'tf',
  'ts',
  'tsx',
  'vue',
  'yaml',
  'yml',
]);

const SOURCE_FILE_NAMES = new Set(['dockerfile']);

const EXCLUDED_SEGMENTS = new Set([
  '.git',
  '.next',
  '__mocks__',
  '__snapshots__',
  '__tests__',
  'bower_components',
  'build',
  'coverage',
  'dist',
  'e2e',
  'fixtures',
  'generated',
  'node_modules',
  'out',
  'target',
  'test',
  'testdata',
  'tests',
  'third_party',
  'vendor',
]);

const EXCLUDED_NAME_PATTERNS = [/\.min\.[cm]?js$/i, /\.d\.[cm]?ts$/i, /\.(test|spec)\.[^.]+$/i];

const YAML_EXTENSIONS = new Set(['yaml', 'yml']);
const WORKFLOW_DIRECTORY = '.github/workflows/';

const RISK_TERMS = [
  'admin',
  'api',
  'auth',
  'controller',
  'cookie',
  'crypto',
  'db',
  'exec',
  'handler',
  'login',
  'middleware',
  'oauth',
  'password',
  'permission',
  'query',
  'route',
  'secret',
  'server',
  'session',
  'sql',
  'token',
  'upload',
  'webhook',
];

export interface TrackedFile {
  path: string;
}

export class SecurityScanScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityScanScopeError';
  }
}

export function parseScanScope(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new SecurityScanScopeError('scope must be a folder path');
  const trimmed = raw
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '.') return null;
  if (
    trimmed.length > SECURITY_SCAN_SCOPE_MAX_LENGTH ||
    trimmed.includes('\0') ||
    trimmed.includes('\\') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('~') ||
    trimmed.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new SecurityScanScopeError('scope must be a folder inside the repository');
  }
  return trimmed;
}

export function parseGitLsFilesStage(output: string): TrackedFile[] {
  const records = output.split('\0');
  records.pop();
  const files: TrackedFile[] = [];
  for (const record of records) {
    const tab = record.indexOf('\t');
    if (tab <= 0) continue;
    const [mode] = record.slice(0, tab).split(' ');
    const path = record.slice(tab + 1);
    if (!mode || !REGULAR_FILE_MODES.has(mode) || !path || path.includes('\0')) continue;
    files.push({ path });
  }
  return files;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isScannableSourcePath(path: string): boolean {
  const segments = path.split('/');
  const name = segments.at(-1) ?? '';
  if (segments.slice(0, -1).some((segment) => EXCLUDED_SEGMENTS.has(segment.toLowerCase()))) {
    return false;
  }
  if (EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(name))) return false;
  const extension = extensionOf(name);
  if (YAML_EXTENSIONS.has(extension)) return path.startsWith(WORKFLOW_DIRECTORY);
  return SOURCE_EXTENSIONS.has(extension) || SOURCE_FILE_NAMES.has(name.toLowerCase());
}

function inScope(path: string, scope: string | null): boolean {
  return scope === null || path === scope || path.startsWith(`${scope}/`);
}

function riskScore(path: string): number {
  const lower = path.toLowerCase();
  return RISK_TERMS.reduce((score, term) => (lower.includes(term) ? score + 1 : score), 0);
}

export function rankCandidateFiles(files: readonly TrackedFile[], scope: string | null): string[] {
  return files
    .map((file) => file.path)
    .filter((path) => inScope(path, scope) && isScannableSourcePath(path))
    .sort(
      (a, b) =>
        riskScore(b) - riskScore(a) ||
        a.split('/').length - b.split('/').length ||
        a.localeCompare(b),
    );
}

export interface ScanBatch {
  files: { path: string; content: string }[];
  bytes: number;
}

export function packScanBatches(
  files: readonly { path: string; content: string }[],
  limits: { maxBatchBytes: number; maxBatches: number },
): { batches: ScanBatch[]; skipped: number } {
  const batches: ScanBatch[] = [];
  let skipped = 0;
  for (const file of files) {
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > limits.maxBatchBytes) {
      skipped += 1;
      continue;
    }
    const open = batches.find((batch) => batch.bytes + bytes <= limits.maxBatchBytes);
    if (open) {
      open.files.push(file);
      open.bytes += bytes;
      continue;
    }
    if (batches.length >= limits.maxBatches) {
      skipped += 1;
      continue;
    }
    batches.push({ files: [file], bytes });
  }
  return { batches, skipped };
}
