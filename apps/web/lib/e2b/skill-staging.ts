import type { SkillFileInventoryEntry, SkillWithFileAccess } from '@agiworkforce/skills';

import { logger } from '@/lib/logger';
import { SANDBOX_WORKSPACE_ROOT } from './attachment-staging';
import type { E2BExecutor } from './types';

const SKILL_SANDBOX_DIRECTORY = '.skills';
const SCRIPT_FILE = /(?:^|\/)scripts\/|\.(?:py|js|mjs|cjs|ts|sh|bash|rb|pl|r)$/i;
const UNSAFE_NAME_CHARACTERS = /[^A-Za-z0-9._-]+/g;
const MAX_STAGED_SKILL_FILES = 100;
const MAX_STAGED_SKILL_BYTES = 4 * 1024 * 1024;

export interface SandboxSeedFile {
  path: string;
  content: string;
}

export type SandboxSeedQueue = (files: readonly SandboxSeedFile[]) => Promise<void>;

interface SkillSandboxFiles {
  directory: string;
  files: SandboxSeedFile[];
  skipped: string[];
}

const SKILL_SCRIPTS_NEED_EXECUTION_NOTE =
  '<skill_sandbox unavailable="true">This skill bundles scripts, but code execution is off for this chat, so they cannot run here. Follow its instructions without running them, and tell the user that turning on code execution lets the skill run its scripts.</skill_sandbox>';

function skillBundlesScripts(files: readonly SkillFileInventoryEntry[]): boolean {
  return files.some((file) => SCRIPT_FILE.test(file.path));
}

function skillSandboxDirectory(skillName: string): string {
  const safe = skillName.replace(UNSAFE_NAME_CHARACTERS, '-').replace(/^[.-]+/, '') || 'skill';
  return `${SANDBOX_WORKSPACE_ROOT}/${SKILL_SANDBOX_DIRECTORY}/${safe}`;
}

function safeRelativePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\0') || path.includes('\\')) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '..' && segment !== '.');
}

async function collectSkillSandboxFiles(
  { skill, access }: SkillWithFileAccess,
  listed: readonly SkillFileInventoryEntry[],
): Promise<SkillSandboxFiles> {
  const directory = skillSandboxDirectory(skill.name);
  const files: SandboxSeedFile[] = [];
  const skipped: string[] = [];
  let bytes = 0;
  for (const [index, entry] of listed.entries()) {
    if (index >= MAX_STAGED_SKILL_FILES || !safeRelativePath(entry.path)) {
      skipped.push(entry.path);
      continue;
    }
    const outcome = await access.readFile(skill, entry.path);
    if (!outcome.ok) {
      skipped.push(entry.path);
      continue;
    }
    const size = Buffer.byteLength(outcome.content, 'utf8');
    if (bytes + size > MAX_STAGED_SKILL_BYTES) {
      skipped.push(entry.path);
      continue;
    }
    bytes += size;
    files.push({ path: `${directory}/${entry.path}`, content: outcome.content });
  }
  return { directory, files, skipped };
}

function skillSandboxNote(staged: SkillSandboxFiles): string {
  const skipped =
    staged.skipped.length > 0
      ? ` These files were not copied because they are not text or are too large: ${staged.skipped.join(', ')}.`
      : '';
  return `<skill_sandbox path="${staged.directory}">This skill's files are copied into the code sandbox at ${staged.directory} when you first run code in this turn. Run a bundled script from there with execute_code, for example by calling it with subprocess from Python. In a later turn, load the skill again before running its scripts.${skipped}</skill_sandbox>`;
}

export async function stageSkillScripts(
  loaded: SkillWithFileAccess,
  codeExecutionOffered: boolean,
  queue: SandboxSeedQueue | undefined,
): Promise<string | null> {
  const listed = await loaded.access.listFiles(loaded.skill);
  if (!skillBundlesScripts(listed)) return null;
  if (!codeExecutionOffered) return SKILL_SCRIPTS_NEED_EXECUTION_NOTE;
  if (!queue) return null;
  const staged = await collectSkillSandboxFiles(loaded, listed);
  await queue(staged.files);
  return skillSandboxNote(staged);
}

export async function writeSandboxSeedFiles(
  executor: E2BExecutor,
  files: readonly SandboxSeedFile[],
  logContext: Record<string, unknown> = {},
): Promise<void> {
  const failed: string[] = [];
  for (const file of files) {
    try {
      const result = await executor.writeFile({
        path: file.path,
        content: file.content,
        encoding: 'utf8',
      });
      if (!result.ok) failed.push(file.path);
    } catch {
      failed.push(file.path);
    }
  }
  if (failed.length > 0) {
    logger.warn(
      { ...logContext, failed, written: files.length - failed.length },
      '[e2b] some skill files could not be copied into the sandbox',
    );
  }
}
