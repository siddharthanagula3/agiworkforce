#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

import {
  RETIRED_MODEL_FAMILY_PATTERNS,
  findModelIdOccurrences,
  loadCanonicalModelIdTokens,
} from '../../scripts/check-no-hardcoded-model-ids.mjs';
import { REPO_ROOTS, buildPathIndex, resolveReference } from '../../scripts/lib/comment-scan.mjs';

const KB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.dirname(KB);
const PLACEHOLDER = '(model name)';
const HOME_DIRECTORY = /(?<![A-Za-z0-9._~-])\/Users\/[A-Za-z0-9._-]+(?=\/)/g;
const WEB_ADDRESS = /https?:\/\/[^\s<>"'`)\]]+/g;
const HELP_ARTICLE = /^(.*\/articles\/\d+)-/;
const REST_OF_NAME = /^[a-z0-9]*(?:[-_.][a-z0-9]+)*/iu;
const PRODUCT_THEN_COUNT =
  /\b(claude) (?=\d[\d,]* (?:px|kb|mb|gb|languages|countries|seats|files|images|pages|to|on)\b)/giu;
const LONG_DASH = `(?:${String.fromCharCode(0x2014)}|\\\\u${(0x2014).toString(16)})`;
const LONG_DASH_CELL = new RegExp(`\\|[ \\t]*${LONG_DASH}[ \\t]*(?=\\|)`, 'giu');
const LONG_DASH_ALONE = new RegExp(`(["'\`(])${LONG_DASH}(?=["'\`)])`, 'giu');
const LONG_DASH_IN_TEXT = new RegExp(`[ \\t]*${LONG_DASH}[ \\t]*`, 'giu');
const URL_CREDENTIALS =
  /\b((?:postgres(?:ql)?|redis|rediss|mysql|mongodb):\/\/)[^\s:@/]+:[^\s@/]+@/giu;
const BACKTICKED = /`([^`\n]+)`/g;
const REPOSITORY_PATH = new RegExp(
  `^(?:${REPO_ROOTS.map((root) => root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\/[A-Za-z0-9_./-]+$`,
);
const NOT_ONE_PATH = /[*{}]|\.\.\./;
const SAYS_IT_IS_GONE =
  /\b(?:ported|moved|migrated|extracted|replaces?|replaced|formerly|previously|superseded|supersedes|lifted|copied|deleted|removed|retired|renamed|was\s+at|used\s+to|no\s+longer|instead\s+of)\b/i;
const PRODUCTION_FLAG = /the production flag\b/g;
const DEPLOY_COMMANDS = /\b(flyctl|railway)\s+(deploy|up)\b/g;
const SKIPPED_NAMES = new Set(['.DS_Store', '__pycache__', 'node_modules']);
const decoder = new TextDecoder('utf-8', { fatal: true });
const anchoredFamilyPatterns = RETIRED_MODEL_FAMILY_PATTERNS.map(({ pattern }) => ({
  pattern,
  whole: new RegExp(`^(?:${pattern.source})$`, 'iu'),
}));

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_NAMES.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

function readText(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.includes(0)) return null;
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

function familyNameLength(matched, whole) {
  let length = matched.length;
  for (let candidate = 1; candidate <= matched.length; candidate += 1) {
    if (whole.test(matched.slice(0, candidate))) {
      length = candidate;
      break;
    }
  }
  return length + REST_OF_NAME.exec(matched.slice(length))[0].length;
}

function modelNameSpans(text, tokens) {
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') lineStarts.push(index + 1);
  }
  const spans = findModelIdOccurrences(text, tokens).map((occurrence) => {
    const start = lineStarts[occurrence.line - 1] + occurrence.column - 1;
    return [start, start + occurrence.id.length];
  });
  for (const { pattern, whole } of anchoredFamilyPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      spans.push([match.index, match.index + familyNameLength(match[0], whole)]);
    }
  }
  spans.sort((left, right) => left[0] - right[0] || right[1] - left[1]);
  const merged = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

function addressWithoutModelName(address, tokens) {
  const spans = modelNameSpans(address, tokens);
  if (spans.length === 0) return address;
  const nameStart = spans[0][0];
  const article = HELP_ARTICLE.exec(address);
  if (article && nameStart >= article[1].length) return article[1];
  const parentEnd = address.lastIndexOf('/', nameStart);
  return parentEnd > address.indexOf('//') + 1 ? address.slice(0, parentEnd) : PLACEHOLDER;
}

function withoutModelNames(text, tokens) {
  let replaced = 0;
  const counted = text.replace(PRODUCT_THEN_COUNT, '$1: ');
  const addressed = counted.replace(WEB_ADDRESS, (address) => {
    const cleaned = addressWithoutModelName(address, tokens);
    if (cleaned !== address) replaced += 1;
    return cleaned;
  });
  const spans = modelNameSpans(addressed, tokens);
  let result = '';
  let cursor = 0;
  for (const [start, end] of spans) {
    result += addressed.slice(cursor, start) + PLACEHOLDER;
    cursor = end;
  }
  return { text: result + addressed.slice(cursor), replaced: replaced + spans.length };
}

function withoutLongDashes(text) {
  return text
    .replace(LONG_DASH_CELL, '| - ')
    .replace(LONG_DASH_ALONE, '$1-')
    .replace(LONG_DASH_IN_TEXT, ', ');
}

function repositoryPathIndex(knowledgeBaseFiles) {
  const listed = execFileSync('git', ['-C', REPO, 'ls-files', '-co', '--exclude-standard', '-z'], {
    maxBuffer: 1024 * 1024 * 256,
  })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const own = knowledgeBaseFiles.map((file) => path.relative(REPO, file).split(path.sep).join('/'));
  return buildPathIndex([...new Set([...listed, ...own])]);
}

function withUnresolvedPathsMarked(text, relativeFile, index) {
  return text
    .split('\n')
    .map((line) =>
      SAYS_IT_IS_GONE.test(line)
        ? line
        : line.replace(BACKTICKED, (whole, reference) => {
            if (!REPOSITORY_PATH.test(reference) || NOT_ONE_PATH.test(reference)) return whole;
            return resolveReference(reference, relativeFile, index, { allowDirectory: true })
              ? whole
              : `${reference} (not found)`;
          }),
    )
    .join('\n');
}

function withCleanWhitespace(text) {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

const tokens = loadCanonicalModelIdTokens(REPO);
let changedFiles = 0;
let replacedNames = 0;
let skippedBinary = 0;

const files = [...walk(KB)];
const pathIndex = repositoryPathIndex(files);

for (const file of files) {
  const original = readText(file);
  if (original === null) {
    skippedBinary += 1;
    continue;
  }
  const scrubbed = withoutModelNames(original, tokens);
  const relativeFile = path.relative(REPO, file).split(path.sep).join('/');
  const cleaned = withoutLongDashes(
    scrubbed.text
      .replace(HOME_DIRECTORY, '~')
      .replace(URL_CREDENTIALS, '$1')
      .replace(PRODUCTION_FLAG, 'the production flag')
      .replace(DEPLOY_COMMANDS, '$1 ($2)'),
  );
  const final = withCleanWhitespace(
    file.endsWith('.md') ? withUnresolvedPathsMarked(cleaned, relativeFile, pathIndex) : cleaned,
  );
  replacedNames += scrubbed.replaced;
  if (final !== original) {
    fs.writeFileSync(file, final);
    changedFiles += 1;
  }
}

process.stdout.write(
  `finalize: files changed ${changedFiles} | model names replaced ${replacedNames} | binary files left alone ${skippedBinary}\n`,
);
