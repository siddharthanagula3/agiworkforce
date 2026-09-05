#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

import {
  loadFamilyCatalog,
  resolveFamilyRefsDeep,
} from '../packages/ai/model-registry/scripts/families.mjs';
import { getLocalModelCatalog } from '../packages/platform/local-llm/src/catalog.ts';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const FAMILY_CATALOG_DIR = 'packages/ai/model-registry/catalog';
const CURATION_PATH = 'packages/ai/model-registry/catalog/models.curation.json';
const SYNCED_PATH = 'packages/ai/model-registry/catalog/models.synced.json';
const RETIRED_MODELS_PATH = 'packages/ai/model-registry/catalog/retired-models.json';
const MODEL_ROUTES_PATH = 'packages/ai/model-registry/catalog/model-routes.json';
const LOCAL_MODEL_CATALOG_PATH = 'packages/platform/local-llm/src/catalog.ts';
export const SPEECH_ARTIFACT_REGISTRY_PATH =
  'packages/ai/model-registry/catalog/speech-artifacts.json';

export const MODEL_ID_OWNER_PATHS = Object.freeze([
  CURATION_PATH,
  SYNCED_PATH,
  RETIRED_MODELS_PATH,
  MODEL_ROUTES_PATH,
  LOCAL_MODEL_CATALOG_PATH,
  SPEECH_ARTIFACT_REGISTRY_PATH,
  'packages/ai/model-registry/catalog/harnesses.json',
  'packages/ai/model-registry/catalog/provider-defaults.json',
  'packages/ai/model-registry/catalog/model-families.json',
  'packages/ai/model-registry/catalog/routing-policies.json',
  'packages/ai/model-registry/generated/registry.json',
  'packages/ai/model-registry/generated/registry.ts',
  'packages/contracts/types/src/models.json',
  // Generated mirror, not an authored fixture: written only by
  // `AGI_UPDATE_ROUTING_CONFORMANCE=1` from the catalog, and replayed verbatim by
  // the Rust resolver so the two implementations cannot silently disagree.
  'packages/ai/routing/src/__tests__/fixtures/auto-route-conformance.json',
  // Same generator, TypeScript-only half: observed-health ranking consumes live
  // measurements the Rust resolver has no store to read, so its cases are not a
  // cross-language contract and live beside the shared file rather than in it.
  'packages/ai/routing/src/__tests__/fixtures/auto-route-observed-health.json',
  'crates/agiworkforce-model-registry/src/generated/model_registry.json',
  'crates/agiworkforce-model-registry/src/generated/model_registry.rs',
  'crates/agiworkforce-protocol/src/generated/model_registry.json',
  'crates/agiworkforce-protocol/src/generated/model_registry.rs',
  'tools/skill-vetting/src/skillspector/providers/openai/model_registry.yaml',
  'tools/skill-vetting/src/skillspector/providers/anthropic/model_registry.yaml',
  // Ops facts for the free lane: pool rows are keyed by route and model ids by
  // design, the same way the catalog files above are.
  'apps/web/config/free-pools.json',
  // Dated research evidence: provider surveys quote model ids as subject
  // matter, the way the registry quotes them as data.
  'docs/research/provider-free-value-matrix-2026-09-01.md',
  'docs/research/free-inference-tos-workbook-2026-09-01.md',
  'docs/architecture/byok-provider-strategy.md',
]);

const OWNER_PATH_SET = new Set(MODEL_ID_OWNER_PATHS);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.a',
  '.appimage',
  '.avi',
  '.bmp',
  '.class',
  '.dll',
  '.dylib',
  '.eot',
  '.exe',
  '.gif',
  '.gz',
  '.icns',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.o',
  '.pdf',
  '.png',
  '.so',
  '.tar',
  '.tgz',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

const MODEL_ID_ALPHANUMERIC = /[A-Za-z0-9]/;
const TOKEN_GROUP_CACHE = new WeakMap();

export const RETIRED_MODEL_FAMILY_PATTERNS = Object.freeze([
  {
    id: 'concrete-gpt-model-family-literal',
    pattern: /\bgpt[-_. ]+[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'retired-stability-image-family',
    pattern: /\bstable[-_. ]+image[-_. ]+[a-z0-9][a-z0-9.-]*\b/giu,
  },
  {
    id: 'concrete-claude-model-family-literal',
    pattern:
      /\b(?:anthropic[.:/_-])?claude[-_. ]+(?:[0-9][a-z0-9]*[-_. ][a-z0-9]+(?:[-_. ][a-z0-9]+)*|(?:sonnet|opus|haiku|mock|oracle|x)(?:[-_. ][a-z0-9]+)*)\b/giu,
  },
  {
    id: 'concrete-gemini-model-family-literal',
    pattern: /\bgemini[-_. ]+[0-9]+(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-deepseek-model-family-literal',
    pattern: /\bdeepseek[-_. ]+(?:r[0-9]+|v[0-9]+|chat|reasoner|coder)(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-llama-model-family-literal',
    pattern: /\bllama[-_. ]*[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-gemma-model-family-literal',
    pattern: /\bgemma[-_. ]*[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-qwen-model-family-literal',
    pattern: /\bqwen[-_. ]+(?:[0-9][a-z0-9]*|coder|oracle)(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-imagen-model-family-literal',
    pattern: /\bimagen[-_. ]*[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-veo-model-family-literal',
    pattern: /\bveo[-_. ]+[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-grok-model-family-literal',
    pattern: /\bgrok[-_. ]+[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-glm-model-family-literal',
    pattern: /\bglm[-_. ]+[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-mistral-model-family-literal',
    pattern:
      /\b(?:mistral|codestral)[-_. ]+(?=[a-z0-9_. -]*[0-9])[a-z0-9]+(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-kimi-model-family-literal',
    pattern: /\bkimi[-_. ]+(?:k[-_. ]*)?[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-seedance-model-family-literal',
    pattern: /\bseedance[-_. ]+[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-runway-model-family-literal',
    pattern: /\bgen[0-9]+[-_. ][a-z0-9]+(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-openai-legacy-media-model-family-literal',
    pattern: /\b(?:dall[-_. ]*e?|tts|whisper)[-_. ]*[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-embedding-model-family-literal',
    pattern:
      /\b(?:text[-_. ]+embedding|gemini[-_. ]+embedding)[-_. ]+[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
  {
    id: 'concrete-image-diffusion-family-literal',
    pattern: new RegExp(
      String.raw`\b(?:stable[-_. ]+diffusion|${['sd', 'xl'].join('')})(?:[-_. ][a-z0-9]+)*\b`,
      'giu',
    ),
  },
  {
    id: 'concrete-perplexity-legacy-model-family-literal',
    pattern: /\bpplx[-_. ]+[0-9][a-z0-9]*(?:[-_. ][a-z0-9]+)*\b/giu,
  },
]);

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function readJson(repoRoot, relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read canonical model metadata at ${relativePath}: ${error.message}`);
  }
  return parsed;
}

function addToken(tokenSources, value, source) {
  if (typeof value !== 'string' || value.length === 0) return;
  if (value !== value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`Invalid model ID in canonical metadata at ${source}`);
  }
  const sources = tokenSources.get(value) ?? new Set();
  sources.add(source);
  tokenSources.set(value, sources);
}

export function loadCanonicalModelIdTokens(repoRoot = REPO_ROOT) {
  const authoredCuration = readJson(repoRoot, CURATION_PATH);
  const familyCatalog = loadFamilyCatalog(path.join(repoRoot, FAMILY_CATALOG_DIR));
  const curation = {
    ...authoredCuration,
    providers: resolveFamilyRefsDeep(authoredCuration.providers, familyCatalog),
    tierAllowedModels: resolveFamilyRefsDeep(authoredCuration.tierAllowedModels, familyCatalog),
  };
  const synced = readJson(repoRoot, SYNCED_PATH);
  const retired = readJson(repoRoot, RETIRED_MODELS_PATH);
  const modelRoutes = readJson(repoRoot, MODEL_ROUTES_PATH);
  const speechArtifacts = readJson(repoRoot, SPEECH_ARTIFACT_REGISTRY_PATH);
  const tokenSources = new Map();

  for (const [modelKey, model] of Object.entries(curation.models ?? {})) {
    addToken(tokenSources, modelKey, `models.${modelKey}`);
    addToken(tokenSources, model?.id, `models.${modelKey}.id`);
    addToken(tokenSources, model?.apiModelId, `models.${modelKey}.apiModelId`);
    addToken(tokenSources, model?.name, `models.${modelKey}.name`);
  }

  for (const [providerId, provider] of Object.entries(curation.providers ?? {})) {
    addToken(tokenSources, provider?.defaultModel, `providers.${providerId}.defaultModel`);
    for (const [task, modelId] of Object.entries(provider?.taskRouting ?? {})) {
      addToken(tokenSources, modelId, `providers.${providerId}.taskRouting.${task}`);
    }
    for (const [alias, target] of Object.entries(provider?.canonicalization ?? {})) {
      addToken(tokenSources, alias, `providers.${providerId}.canonicalization.${alias}`);
      addToken(tokenSources, target, `providers.${providerId}.canonicalization.${alias}`);
    }
  }

  for (const [tier, modelIds] of Object.entries(curation.tierAllowedModels ?? {})) {
    if (!Array.isArray(modelIds)) continue;
    for (const modelId of modelIds) {
      addToken(tokenSources, modelId, `tierAllowedModels.${tier}`);
    }
  }

  for (const modelKey of Object.keys(synced.models ?? {})) {
    addToken(tokenSources, modelKey, `synced.models.${modelKey}`);
  }

  for (const [modelKey, declaration] of Object.entries(modelRoutes.models ?? {})) {
    for (const [index, route] of (declaration?.additionalRoutes ?? []).entries()) {
      addToken(
        tokenSources,
        route?.upstreamModelId,
        `modelRoutes.${modelKey}.additionalRoutes.${index}.upstreamModelId`,
      );
    }
  }

  for (const modelId of retired.retiredModelIds ?? []) {
    addToken(tokenSources, modelId, `retiredModelIds.${modelId}`);
  }
  for (const modelId of retired.guardedNonCanonicalModelIds ?? []) {
    addToken(tokenSources, modelId, `guardedNonCanonicalModelIds.${modelId}`);
  }

  const localModels = getLocalModelCatalog();
  for (const model of localModels) {
    addToken(tokenSources, model.id, `localModels.${model.id}.id`);
    addToken(tokenSources, model.family, `localModels.${model.id}.family`);
    addToken(
      tokenSources,
      model.executorchPreset?.modelName,
      `localModels.${model.id}.executorchPreset.modelName`,
    );
  }

  for (const [index, artifact] of (speechArtifacts.whisperModels ?? []).entries()) {
    addToken(tokenSources, artifact?.filename, `speechArtifacts.whisperModels.${index}.filename`);
  }
  for (const [index, artifact] of (speechArtifacts.piperVoices ?? []).entries()) {
    addToken(tokenSources, artifact?.id, `speechArtifacts.piperVoices.${index}.id`);
    addToken(
      tokenSources,
      artifact?.modelFilename,
      `speechArtifacts.piperVoices.${index}.modelFilename`,
    );
    addToken(
      tokenSources,
      artifact?.configFilename,
      `speechArtifacts.piperVoices.${index}.configFilename`,
    );
  }
  for (const [index, artifact] of (speechArtifacts.piperBinaries ?? []).entries()) {
    addToken(tokenSources, artifact?.id, `speechArtifacts.piperBinaries.${index}.id`);
    addToken(
      tokenSources,
      artifact?.archiveFilename,
      `speechArtifacts.piperBinaries.${index}.archiveFilename`,
    );
  }
  for (const [index, replacement] of (speechArtifacts.replacements ?? []).entries()) {
    addToken(
      tokenSources,
      replacement?.previousId,
      `speechArtifacts.replacements.${index}.previousId`,
    );
    addToken(
      tokenSources,
      replacement?.replacementId,
      `speechArtifacts.replacements.${index}.replacementId`,
    );
  }

  if (tokenSources.size === 0) {
    throw new Error('Canonical model metadata produced an empty model-ID token set');
  }

  return [...tokenSources.entries()]
    .map(([id, sources]) => ({
      id,
      sources: [...sources].sort(),
    }))
    .sort((left, right) => right.id.length - left.id.length || left.id.localeCompare(right.id));
}

function groupTokensByFirstCharacter(tokens) {
  const cached = TOKEN_GROUP_CACHE.get(tokens);
  if (cached) return cached;
  const groups = new Map();
  for (const token of tokens) {
    const candidates = groups.get(token.id[0]) ?? [];
    candidates.push(token);
    groups.set(token.id[0], candidates);
  }
  for (const candidates of groups.values()) {
    candidates.sort(
      (left, right) => right.id.length - left.id.length || left.id.localeCompare(right.id),
    );
  }
  TOKEN_GROUP_CACHE.set(tokens, groups);
  return groups;
}

function hasAlphanumericEdge(text, edgeIndex) {
  const edge = text[edgeIndex];
  return edge !== undefined && MODEL_ID_ALPHANUMERIC.test(edge);
}

export function findModelIdOccurrences(text, tokens) {
  const groups = groupTokensByFirstCharacter(tokens);
  const occurrences = [];
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      line += 1;
      lineStart = index + 1;
      continue;
    }

    const candidates = groups.get(text[index]);
    if (!candidates) continue;

    let matched;
    for (const candidate of candidates) {
      if (!text.startsWith(candidate.id, index)) continue;
      const leftEdgeIndex = index - 1;
      const rightEdgeIndex = index + candidate.id.length;
      if (hasAlphanumericEdge(text, leftEdgeIndex) || hasAlphanumericEdge(text, rightEdgeIndex)) {
        break;
      }
      matched = candidate;
      break;
    }

    if (!matched) continue;
    occurrences.push({
      id: matched.id,
      line,
      column: index - lineStart + 1,
      sources: matched.sources,
    });
    index += matched.id.length - 1;
  }

  return occurrences;
}

export function findRetiredModelFamilyOccurrences(text) {
  const occurrences = [];
  for (const { id, pattern } of RETIRED_MODEL_FAMILY_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      const prefix = text.slice(0, index);
      const lastNewline = prefix.lastIndexOf('\n');
      occurrences.push({
        id,
        line: prefix.split('\n').length,
        column: index - lastNewline,
        sources: ['retired-model-family-policy'],
      });
    }
  }
  return occurrences;
}

export function isModelIdOwnerPath(repoRoot, filePath) {
  const relativePath = toPosixPath(path.relative(repoRoot, path.resolve(filePath)));
  return OWNER_PATH_SET.has(relativePath);
}

const SKILLS_LOCK_PATH = 'skills-lock.json';
const FIRST_PARTY_SKILL_SOURCE = 'first-party';
const VENDORED_SKILL_PREFIX_CACHE = new Map();

export function vendoredSkillPrefixes(repoRoot = REPO_ROOT) {
  const cached = VENDORED_SKILL_PREFIX_CACHE.get(repoRoot);
  if (cached) return cached;
  let prefixes = [];
  try {
    const lock = JSON.parse(readFileSync(path.join(repoRoot, SKILLS_LOCK_PATH), 'utf8'));
    const skills =
      lock?.skills && typeof lock.skills === 'object' ? Object.values(lock.skills) : [];
    prefixes = skills
      .filter((skill) => skill?.sourceType && skill.sourceType !== FIRST_PARTY_SKILL_SOURCE)
      .map((skill) => `${toPosixPath(skill.path)}/`);
  } catch {
    prefixes = [];
  }
  VENDORED_SKILL_PREFIX_CACHE.set(repoRoot, prefixes);
  return prefixes;
}

export function isVendoredSkillPath(repoRoot, filePath) {
  const relativePath = toPosixPath(path.relative(repoRoot, path.resolve(filePath)));
  return vendoredSkillPrefixes(repoRoot).some((prefix) => relativePath.startsWith(prefix));
}

function readUtf8Text(filePath) {
  const stat = lstatSync(filePath);
  if (stat.isSymbolicLink()) return readlinkSync(filePath, 'utf8');
  if (!stat.isFile()) return null;
  const bytes = readFileSync(filePath);
  try {
    return UTF8_DECODER.decode(bytes);
  } catch (error) {
    if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return null;
    throw new Error(`Cannot scan non-UTF-8 repository file ${filePath}: ${error.message}`);
  }
}

export function scanModelIdFiles({ repoRoot = REPO_ROOT, filePaths, tokens }) {
  const violations = [];
  const skippedFiles = [];

  for (const filePath of [...new Set(filePaths.map((file) => path.resolve(file)))].sort()) {
    if (isModelIdOwnerPath(repoRoot, filePath) || isVendoredSkillPath(repoRoot, filePath)) continue;
    let text;
    try {
      text = readUtf8Text(filePath);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (text === null) {
      skippedFiles.push(filePath);
      continue;
    }

    const relativePath = toPosixPath(path.relative(repoRoot, filePath));
    const concreteOccurrences = findModelIdOccurrences(text, tokens);
    const occupiedLocations = new Set();
    for (const occurrence of concreteOccurrences) {
      violations.push({ file: relativePath, ...occurrence });
      occupiedLocations.add(`${occurrence.line}:${occurrence.column}`);
    }
    for (const occurrence of findRetiredModelFamilyOccurrences(text)) {
      if (occupiedLocations.has(`${occurrence.line}:${occurrence.column}`)) continue;
      violations.push({ file: relativePath, ...occurrence });
    }
  }

  violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.id.localeCompare(right.id),
  );
  return { violations, skippedFiles };
}

export function discoverRepositoryFiles(repoRoot = REPO_ROOT) {
  let output;
  try {
    output = execFileSync(
      'git',
      ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    );
  } catch (error) {
    throw new Error(`Cannot enumerate repository files with git ls-files: ${error.message}`);
  }

  return [...new Set(output.split('\0').filter(Boolean))]
    .sort()
    .map((relativePath) => path.join(repoRoot, relativePath));
}

function formatViolationSummary(violations, details) {
  const files = new Map();
  const ids = new Map();
  for (const violation of violations) {
    const fileSummary = files.get(violation.file) ?? { count: 0, ids: new Map() };
    fileSummary.count += 1;
    fileSummary.ids.set(violation.id, (fileSummary.ids.get(violation.id) ?? 0) + 1);
    files.set(violation.file, fileSummary);
    ids.set(violation.id, (ids.get(violation.id) ?? 0) + 1);
  }

  const lines = [
    `Model-ID literal guard FAILED: ${violations.length} occurrence(s) in ${files.size} file(s) (${ids.size} distinct catalog/provider/alias token(s)).`,
    'Concrete IDs are allowed only in exact model-registry authored inputs and generated mirrors.',
    '',
  ];

  if (details) {
    for (const violation of violations) {
      lines.push(`- ${violation.file}:${violation.line}:${violation.column}  [${violation.id}]`);
    }
  } else {
    for (const [file, summary] of [...files.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const counts = [...summary.ids.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, count]) => `${id} x${count}`)
        .join(', ');
      lines.push(`- ${file}: ${summary.count} occurrence(s), ${counts}`);
    }
    lines.push('', 'Run with --details for exact line and column locations.');
  }

  return lines.join('\n');
}

export function runRepositoryModelIdGuard({ repoRoot = REPO_ROOT, details = false } = {}) {
  const tokens = loadCanonicalModelIdTokens(repoRoot);
  const filePaths = discoverRepositoryFiles(repoRoot);
  const result = scanModelIdFiles({ repoRoot, filePaths, tokens });
  return {
    ...result,
    tokens,
    output:
      result.violations.length === 0
        ? `Model-ID literal guard passed (${tokens.length} catalog/provider/alias token(s), ${filePaths.length} repository file(s)).`
        : formatViolationSummary(result.violations, details),
  };
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/check-no-hardcoded-model-ids.mjs [--details]',
      '',
      '  --details  print every violating occurrence with line and column',
      '',
    ].join('\n'),
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
  } else {
    const unknown = args.filter((arg) => arg !== '--details');
    if (unknown.length > 0) {
      process.stderr.write(`Unknown argument(s): ${unknown.join(', ')}\n`);
      process.exitCode = 2;
    } else {
      try {
        const result = runRepositoryModelIdGuard({ details: args.includes('--details') });
        const stream = result.violations.length === 0 ? process.stdout : process.stderr;
        stream.write(`${result.output}\n`);
        if (result.violations.length > 0) process.exitCode = 1;
      } catch (error) {
        process.stderr.write(`Model-ID literal guard could not run: ${error.message}\n`);
        process.exitCode = 2;
      }
    }
  }
}
