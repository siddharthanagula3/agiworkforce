
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FrontmatterError, parseFrontmatter } from './frontmatter';
import { computeSkillTreeHash, hashSkillContent, readSkillVersion } from './integrity';
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
    const tools = asStringArray(r['tools']);
    const env = asStringArray(r['env']);
    const config = asStringArray(r['config']);
    if (bins || anyBins || tools || env || config) {
      meta.requires = {};
      if (bins) meta.requires.bins = bins;
      if (anyBins) meta.requires.anyBins = anyBins;
      if (tools) meta.requires.tools = tools;
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
  packageDir?: string,
): Promise<Skill | null> {
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    return null;
  }
  const raw = bytes.toString('utf-8');
  let data: Record<string, unknown>;
  let body: string;
  try {
    ({ data, body } = parseFrontmatter(raw));
  } catch (err) {
    if (err instanceof FrontmatterError) {
      return null;
    }
    throw err;
  }
  const name = asString(data['name']) ?? fallbackName;
  const description = asString(data['description']) ?? `Skill ${name}`;
  const version = readSkillVersion(data);
  let treeHash: string | undefined;
  if (packageDir !== undefined) {
    try {
      treeHash = await computeSkillTreeHash(packageDir);
    } catch {
      treeHash = undefined;
    }
  }
  const skill: Skill = {
    name,
    description,
    body: body.trim(),
    contentHash: hashSkillContent(bytes),
    filePath,
    source,
    metadata: extractMetadata(data),
    frontmatter: data,
  };
  if (version !== undefined) skill.version = version;
  if (treeHash !== undefined) skill.treeHash = treeHash;
  return skill;
}

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
      const packageDir = join(layer.rootDir, entry.name);
      const skillFile = join(packageDir, 'SKILL.md');
      const skill = await loadSkillFile(skillFile, entry.name, layer.source, packageDir);
      if (skill) out.push(skill);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase() === 'readme.md') continue;
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const filePath = join(layer.rootDir, entry.name);
      const fallback = entry.name.replace(/\.md$/i, '');
      const skill = await loadSkillFile(filePath, fallback, layer.source);
      if (skill) out.push(skill);
    }
  }
  return out;
}

export async function loadSkillsFromLayers(layers: SkillLayer[]): Promise<Skill[][]> {
  return Promise.all(layers.map((layer) => loadSkillsFromDir(layer)));
}
