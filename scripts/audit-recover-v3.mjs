#!/usr/bin/env node
// Replay v3: full op-sequence replay for specific batches, including Bash
// commands that touch the part file (heredoc appends etc.). Write/Edit ops
// are applied to disk with prettier simulated after each (the hook), Bash
// ops are executed verbatim from the repo root with the file present on disk.
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

function prettierFile(p) {
  spawnSync('pnpm', ['exec', 'prettier', '--write', p], { cwd: ROOT, encoding: 'utf8' });
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
        let id = null;
        if (b.name === 'Write' || b.name === 'Edit') {
          const m = (b.input?.file_path || '').match(partRe);
          if (m) id = m[1];
        } else if (b.name === 'Bash') {
          const m = (b.input?.command || '').match(partRe);
          if (m) id = m[1];
        }
        if (!id || !TARGETS.has(id)) continue;
        if (!ops.has(id)) ops.set(id, []);
        ops.get(id).push({ kind: b.name, input: b.input });
      }
    }
  }
}

for (const [id, list] of [...ops.entries()].sort()) {
  const file = path.join(ROOT, 'AUDIT_PARTS', `batch-${id}.md`);
  fs.rmSync(file, { force: true });
  let bashRan = 0;
  for (const op of list) {
    if (op.kind === 'Write') {
      fs.writeFileSync(file, op.input.content ?? '');
      prettierFile(file);
    } else if (op.kind === 'Edit') {
      const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const { old_string = '', new_string = '', replace_all } = op.input;
      if (cur.includes(old_string)) {
        fs.writeFileSync(
          file,
          replace_all
            ? cur.split(old_string).join(new_string)
            : cur.replace(old_string, new_string),
        );
      } else {
        let added = new_string;
        if (old_string && new_string.includes(old_string))
          added = new_string.replace(old_string, '');
        if (added.trim()) fs.writeFileSync(file, cur.trimEnd() + '\n\n' + added.trim() + '\n');
        console.log(`  batch-${id}: edit-miss salvage-append`);
      }
      prettierFile(file);
    } else if (op.kind === 'Bash') {
      const r = spawnSync('bash', ['-c', op.input.command], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 30000,
      });
      bashRan++;
      if (r.status !== 0) console.log(`  batch-${id}: bash op exit ${r.status}`);
    }
  }
  const cur = fs.readFileSync(file, 'utf8');
  const n = (s) => (cur.match(new RegExp(`^### \\[${s}\\]`, 'gm')) || []).length;
  console.log(
    `batch-${id}: ops=${list.length} bash=${bashRan} -> C${n('CRITICAL')}/H${n('HIGH')}/M${n('MEDIUM')}/L${n('LOW')}`,
  );
}
