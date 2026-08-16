#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = '/Users/siddhartha/Desktop/agiworkforce';
const WF_BASE =
  '/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/58e9021c-8771-46a7-a64a-5ee945ae5c99/subagents/workflows';
const RUNS = [
  'wf_446fdafd-4dd',
  'wf_f0967038-3e6',
  'wf_6c7ed04e-fe5',
  'wf_8637a7ad-81f',
  'wf_290632cc-937',
  'wf_dc996cce-d03',
];
const TARGETS = new Set(process.argv.slice(2));
const partRe = /AUDIT_PARTS\/batch-(\d{3})\.md/;

function prettier(content, id) {
  const r = spawnSync(
    'pnpm',
    ['exec', 'prettier', '--stdin-filepath', `AUDIT_PARTS/batch-${id}.md`],
    { cwd: ROOT, input: content, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return r.status === 0 && r.stdout ? r.stdout : content;
}

const ops = new Map();
for (const run of RUNS) {
  const dir = path.join(WF_BASE, run);
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith('.jsonl'))
    .sort()) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    for (const line of lines) {
      if (!line.includes('AUDIT_PARTS/batch-')) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const content = obj?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const b of content) {
        if (b.type !== 'tool_use') continue;
        const fp = b.input?.file_path || '';
        const m = fp.match(partRe);
        if (!m || !TARGETS.has(m[1])) continue;
        if (b.name === 'Write' || b.name === 'Edit') {
          if (!ops.has(m[1])) ops.set(m[1], []);
          ops.get(m[1]).push({ kind: b.name, input: b.input });
        }
      }
    }
  }
}

for (const [id, list] of [...ops.entries()].sort()) {
  let cur = '';
  let salvaged = 0;
  for (const op of list) {
    if (op.kind === 'Write') {
      cur = op.input.content ?? '';
    } else {
      const { old_string = '', new_string = '', replace_all } = op.input;
      const apply = (text) =>
        replace_all
          ? text.split(old_string).join(new_string)
          : text.replace(old_string, new_string);
      if (cur.includes(old_string)) {
        cur = apply(cur);
      } else {
        const fmt = prettier(cur, id);
        if (fmt.includes(old_string)) {
          cur = apply(fmt);
        } else {
          let added = new_string;
          if (old_string && new_string.includes(old_string)) {
            added = new_string.replace(old_string, '');
          }
          if (added.trim()) {
            cur = cur.trimEnd() + '\n\n' + added.trim() + '\n';
            salvaged++;
          }
        }
      }
    }
    cur = prettier(cur, id);
  }
  fs.writeFileSync(path.join(ROOT, 'AUDIT_PARTS', `batch-${id}.md`), cur);
  const n = (s) => (cur.match(new RegExp(`^### \\[${s}\\]`, 'gm')) || []).length;
  console.log(
    `batch-${id}: ops=${list.length} salvaged-appends=${salvaged} -> C${n('CRITICAL')}/H${n('HIGH')}/M${n('MEDIUM')}/L${n('LOW')}`,
  );
}
