#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

const DOC_TIERS = new Set([
  'agent-context',
  'architecture',
  'compliance',
  'decisions',
  'development',
  'generated',
  'product',
  'research',
  'runbooks',
  'security',
  'specs',
  'standards',
  'work',
]);

const ROOT_DOCS = new Set([
  'AGENTS.md',
  'ARCHITECTURE.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'DPDP_PROGRESS.md',
  'PLAN.md',
  'README.md',
  'SECURITY.md',
  'THIRD_PARTY_LICENSES.md',
]);

// Markdown that is not documentation: shipped content, tool-owned output,
// byte-sensitive fixtures, and files a packaging step addresses by exact path.
const NON_DOC_MARKDOWN = [
  '.agents/skills/',
  '.claude/rules/',
  '.github/',
  'scripts/__fixtures__/',
  'tools/skill-vetting/samples/',
  'apps/cli/src/output_styles/',
  'apps/extension-vscode/media/walkthrough/',
  'apps/mobile/store-listing/',
  'apps/mobile/scripts/release/',
  'apps/web/content/',
  'audit/',
];

const NON_DOC_FILES = new Map([
  [
    'apps/web/AGENTS.md',
    'written by `next dev`; committing it is cheaper than reverting a diff that regenerates',
  ],
  [
    'apps/web/CLAUDE.md',
    'written by `next dev`; committing it is cheaper than reverting a diff that regenerates',
  ],
  [
    'apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md',
    'excluded from the packaged vsix by exact path in vsce-package.js and .vscodeignore, and check-ci-guardrails asserts on it by exact path',
  ],
  ['apps/web/db/neon/CORRECTIONS.md', 'belongs to the append-only migration chain it corrects'],
  [
    'tools/skill-vetting/THIRD_PARTY_NOTICES.md',
    'license notice; must ship beside the code it covers',
  ],
]);

// Root files that were removed and must not be cited as if they were still
// live. check:reference-integrity cannot see these: it builds its matcher from
// REPO_ROOTS, so a backticked bare root filename never matches, which is how six
// documents went on calling TODO.md "the active queue" months after it was
// deleted. A citation is allowed only on a line that marks the file as gone.
const RETIRED_ROOT_FILES = ['TODO.md', 'BUILD.md', 'AGI_WORKFORCE.md', 'ONBOARDING.md'];
const RETIRED_OK =
  /retired|no longer|stopped existing|was deleted|were removed|was removed|do not create|does not exist/i;

function checkRetiredRootCitations() {
  const scanned = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((file) => file !== 'CHANGELOG.md');

  for (const file of scanned) {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      // Prose wraps, so the marker that excuses a citation may sit on the next
      // line. Read a small window rather than the single line.
      const window = lines.slice(Math.max(0, index - 1), index + 2).join(' ');
      if (RETIRED_OK.test(window)) return;
      for (const retired of RETIRED_ROOT_FILES) {
        if (line.includes(`\`${retired}\``)) {
          errors.push(
            `${file}:${index + 1} cites \`${retired}\` as current, but it was removed from the root`,
          );
        }
      }
    });
  }
}

function trackedMarkdown() {
  return execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function classify(file) {
  if (!file.includes('/')) {
    return ROOT_DOCS.has(file)
      ? null
      : `root markdown must be one of ${[...ROOT_DOCS].join(', ')}, or registered in scripts/check-repo-organization.mjs and here`;
  }

  if (NON_DOC_MARKDOWN.some((prefix) => file.startsWith(prefix))) return null;
  if (NON_DOC_FILES.has(file)) return null;

  if (file.startsWith('docs/')) {
    if (file === 'docs/README.md') return null;
    const tier = file.split('/')[1];
    return DOC_TIERS.has(tier)
      ? null
      : `docs/${tier}/ is not a documentation tier; use one of ${[...DOC_TIERS].join(', ')} (see the AGENTS.md table)`;
  }

  // Surface- and package-local documentation.
  if (/^apps\/[^/]+\/docs\//.test(file)) return null;
  if (path.basename(file) === 'README.md') return null;

  return 'markdown outside docs/ must be a README.md beside what it describes, or live under the surface’s docs/ directory';
}

// Two patterns this repository has actually produced and had to undo: a status
// document that outlives the work it describes, and a directory of production
// source kept as an archive. apps/desktop/archive reached 204 files and 40,549
// lines before it was deleted; docs/work/guardian-implementation-status.md had
// to be split apart because its status half went stale while its design half
// was the only copy. Neither was caught by anything.
const STATUS_DOC = /(^|\/)[a-z0-9-]*(status|progress|todo|tasks)\.md$/i;
const STATUS_EXEMPT = new Set([
  // Named for what it tracks, not a status snapshot: it is the spec lifecycle's
  // task file, owned by a spec directory alongside spec.md and plan.md.
  'tasks.md',
]);

// Grandfathered, with the reason. Removing this one was proposed twice and
// refuted both times on evidence: its seventeen five-column matrices carry a
// competitive-target column, a surfaces tuple and per-table source and
// code-anchor footers that no machine source holds. The ratchet stops NEW status
// documents; it does not relitigate a settled decision.
const STATUS_BASELINE = new Set(['docs/work/implementation-status.md']);

function checkStatusDocuments(files) {
  for (const file of files) {
    if (!STATUS_DOC.test(file)) continue;
    if (STATUS_EXEMPT.has(path.basename(file))) continue;
    if (STATUS_BASELINE.has(file)) continue;
    if (file.startsWith('docs/specs/')) continue;
    if (NON_DOC_MARKDOWN.some((prefix) => file.startsWith(prefix))) continue;
    errors.push(
      `${file} is a status document. Status goes stale silently: put executable work in a docs/specs/<feature>/tasks.md, machine-readable state in a registry, and history in git.`,
    );
  }
}

function checkArchiveDirectories(files) {
  for (const file of files) {
    if (/(^|\/)(archive|_archive|legacy|deprecated)\//i.test(file)) {
      errors.push(
        `${file} sits in an archive directory. Git is the archive, delete the tree instead of keeping a second copy of retired source.`,
      );
    }
  }
}

checkRetiredRootCitations();

const allTracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
checkStatusDocuments(trackedMarkdown());
checkArchiveDirectories(allTracked);

for (const file of trackedMarkdown()) {
  const problem = classify(file);
  if (problem) errors.push(`${file}: ${problem}`);
}

// A tier that exists on disk but holds nothing is a taxonomy that lies.
for (const tier of DOC_TIERS) {
  const dir = path.join(root, 'docs', tier);
  if (!fs.existsSync(dir)) continue;
  const entries = execFileSync('git', ['ls-files', `docs/${tier}`], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  if (entries.length === 0) {
    errors.push(
      `docs/${tier}/ is registered as a tier but holds no tracked file; remove it or fill it`,
    );
  }
}

if (errors.length > 0) {
  console.error('Documentation registry check failed:');
  for (const error of errors) console.error(`- ${error}`);
  console.error('\nEvery document has exactly one owner. See the taxonomy table in AGENTS.md §11.');
  process.exit(1);
}

console.log(
  `Documentation registry check passed (${trackedMarkdown().length} tracked markdown files).`,
);
