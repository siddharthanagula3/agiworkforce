import * as fs from 'fs';

export type MutableEnv = Record<string, string | undefined>;

export interface EnvFileApplication {
  applied: string[];
  keptFromProcess: string[];
}

export function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').replace(/^["']|["']$/g, '');
    if (key && value) parsed[key] = value;
  }
  return parsed;
}

/**
 * Fills gaps in the environment from a file; it never overwrites.
 *
 * The loader this replaces assigned every key unconditionally, so a value the
 * runner had deliberately exported was silently replaced by whatever the
 * developer's own `.env.local` happened to hold. That is the opposite of what
 * dotenv does and the opposite of what an explicit export means, and it made a
 * local run of a spec exercise a different configuration than the one the
 * operator asked for.
 */
export function applyEnvFile(contents: string, env: MutableEnv = process.env): EnvFileApplication {
  const applied: string[] = [];
  const keptFromProcess: string[] = [];
  for (const [key, value] of Object.entries(parseEnvFile(contents))) {
    if (env[key] !== undefined && env[key] !== '') {
      keptFromProcess.push(key);
      continue;
    }
    env[key] = value;
    applied.push(key);
  }
  return { applied, keptFromProcess };
}

/**
 * A runner's environment is the authority, so the file is not read there at
 * all: a stray `.env.local` on a build machine must not reach the test process.
 */
export function loadLocalEnvFile(path: string, env: MutableEnv = process.env): void {
  if (env['CI']) return;
  if (!fs.existsSync(path)) return;
  applyEnvFile(fs.readFileSync(path, 'utf-8'), env);
}
