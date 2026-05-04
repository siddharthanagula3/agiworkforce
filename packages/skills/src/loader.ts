/**
 * Skill loader: scan a directory, parse SKILL.md files, return Skill records.
 *
 * Two layouts supported:
 *   - **OpenClaw-style**: `<rootDir>/<skill-id>/SKILL.md` — the canonical
 *     subdirectory layout. The directory name is used as a fallback
 *     skill key when frontmatter omits `name`.
 *   - **Flat**: `<rootDir>/<name>.md` — single-file layout for simple cases.
 *     Filename (sans `.md`) is the fallback skill key.
 *
 * Hidden files (`.foo`) and non-`.md` files are skipped. Errors loading any
 * single file don't fail the batch — bad skills are logged and dropped.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseFrontmatter } from './frontmatter';
import type { Skill, SkillLayer, SkillMetadata, SkillSource } from './types';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string');
  return out.length > 0 ? out : undefined;
}

function extractMetadata(frontmatter: Record<string, unknown>): SkillMetadata {
  const meta: SkillMetadata = {};
  if (typeof frontmatter['always'] === 'boolean') meta.always = frontmatter['always'];
  const skillKey = asString(frontmatter['skillKey']);
  if (skillKey !== undefined) meta.skillKey = skillKey;
  const primaryEnv = asString(frontmatter['primaryEnv']);
  if (primaryEnv !== undefined) meta.primaryEnv = primaryEnv;
  const emoji = asString(frontmatter['emoji']);
  if (emoji !== undefined) meta.emoji = emoji;
  const homepage = asString(frontmatter['homepage']);
  if (homepage !== undefined) meta.homepage = homepage;
  const os = asStringArray(frontmatter['os']);
  if (os !== undefined) meta.os = os;
  const requires = frontmatter['requires'];
  if (requires && typeof requires === 'object' && !Array.isArray(requires)) {
    const r = requires as Record<string, unknown>;
    const bins = asStringArray(r['bins']);
    const anyBins = asStringArray(r['anyBins']);
    const env = asStringArray(r['env']);
    const config = asStringArray(r['config']);
    if (bins || anyBins || env || config) {
      meta.requires = {};
      if (bins) meta.requires.bins = bins;
      if (anyBins) meta.requires.anyBins = anyBins;
      if (env) meta.requires.env = env;
      if (config) meta.requires.config = config;
    }
  }
  return meta;
}

async function loadSkillFile(
  filePath: string,
  fallbackName: string,
  source: SkillSource,
): Promise<Skill | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
  const { data, body } = parseFrontmatter(raw);
  const name = asString(data['name']) ?? fallbackName;
  const description = asString(data['description']) ?? `Skill ${name} loaded from ${filePath}`;
  return {
    name,
    description,
    body: body.trim(),
    filePath,
    source,
    metadata: extractMetadata(data),
    frontmatter: data,
  };
}

/**
 * Load all skills from a single directory. Tries the OpenClaw subdir layout
 * first, then falls back to flat `*.md`.
 */
export async function loadSkillsFromDir(layer: SkillLayer): Promise<Skill[]> {
  const out: Skill[] = [];
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = await readdir(layer.rootDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      const skillFile = join(layer.rootDir, entry.name, 'SKILL.md');
      const skill = await loadSkillFile(skillFile, entry.name, layer.source);
      if (skill) out.push(skill);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const filePath = join(layer.rootDir, entry.name);
      const fallback = entry.name.replace(/\.md$/i, '');
      const skill = await loadSkillFile(filePath, fallback, layer.source);
      if (skill) out.push(skill);
    }
  }
  return out;
}

/** Load skills from many layers in parallel. Order of `layers` is preserved. */
export async function loadSkillsFromLayers(layers: SkillLayer[]): Promise<Skill[][]> {
  return Promise.all(layers.map((layer) => loadSkillsFromDir(layer)));
}
