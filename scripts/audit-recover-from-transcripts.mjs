#!/usr/bin/env node
// Recover AUDIT_PARTS/batch-*.md and AUDIT_BATCHES/batch-*.txt after the
// 2026-06-10 deletion of untracked audit artifacts, by replaying Write/Edit
// tool calls recorded in the scan agents' transcripts.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/siddhartha/Desktop/agiworkforce';
const WF_BASE =
  '/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/58e9021c-8771-46a7-a64a-5ee945ae5c99/subagents/workflows';
// chronological order — later runs overwrite earlier partials (025, 032)
const RUNS = [
  'wf_446fdafd-4dd', // chunk A first attempt (001-031 done, 025/032 partial)
  'wf_f0967038-3e6', // chunk A remainder (025, 032-063)
  'wf_6c7ed04e-fe5', // 064-075
  'wf_8637a7ad-81f', // 076-087
  'wf_290632cc-937', // 088-099
  'wf_dc996cce-d03', // 100-129
];

const parts = new Map(); // batchId -> content
const lists = new Map(); // batchId -> [file paths]
const warnings = [];

const partRe = /AUDIT_PARTS\/batch-(\d{3})\.md/;
const listRe = /AUDIT_BATCHES\/batch-(\d{3})\.txt/;

for (const run of RUNS) {
  const dir = path.join(WF_BASE, run);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    const pendingReads = new Map(); // tool_use_id -> batchId (for batch list reads)
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const content = obj?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === 'tool_use') {
          const fp = block.input?.file_path || '';
          if (block.name === 'Write' && partRe.test(fp)) {
            parts.set(fp.match(partRe)[1], block.input.content ?? '');
          } else if (block.name === 'Edit' && partRe.test(fp)) {
            const id = fp.match(partRe)[1];
            const cur = parts.get(id);
            const { old_string, new_string, replace_all } = block.input || {};
            if (cur === undefined || old_string === undefined) {
              warnings.push(`edit-without-base batch-${id} (${run}/${f})`);
              continue;
            }
            if (!cur.includes(old_string)) {
              warnings.push(`edit-miss batch-${id} (${run}/${f})`);
              continue;
            }
            parts.set(
              id,
              replace_all
                ? cur.split(old_string).join(new_string)
                : cur.replace(old_string, new_string),
            );
          } else if (block.name === 'Read' && listRe.test(fp)) {
            pendingReads.set(block.id, fp.match(listRe)[1]);
          }
        } else if (block.type === 'tool_result' && pendingReads.has(block.tool_use_id)) {
          const id = pendingReads.get(block.tool_use_id);
          pendingReads.delete(block.tool_use_id);
          if (lists.has(id)) continue;
          let text = '';
          if (typeof block.content === 'string') text = block.content;
          else if (Array.isArray(block.content))
            text = block.content
              .filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
          const paths = [];
          for (const l of text.split('\n')) {
            const m = l.match(/^\s*\d+→(.*)$/) || l.match(/^\s*\d+\t(.*)$/);
            if (m && m[1].trim()) paths.push(m[1].trim());
          }
          if (paths.length) lists.set(id, paths);
        }
      }
    }
  }
}

fs.mkdirSync(path.join(ROOT, 'AUDIT_PARTS'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'AUDIT_BATCHES'), { recursive: true });
for (const [id, content] of parts)
  fs.writeFileSync(path.join(ROOT, 'AUDIT_PARTS', `batch-${id}.md`), content);
for (const [id, paths] of lists)
  fs.writeFileSync(path.join(ROOT, 'AUDIT_BATCHES', `batch-${id}.txt`), paths.join('\n') + '\n');

const ids = [...parts.keys()].sort();
const missingParts = [];
const missingLists = [];
for (let i = 1; i <= 129; i++) {
  const id = String(i).padStart(3, '0');
  if (!parts.has(id)) missingParts.push(id);
  if (!lists.has(id)) missingLists.push(id);
}
console.log(`recovered parts: ${parts.size} (${ids[0]}..${ids[ids.length - 1]})`);
console.log(`recovered batch lists: ${lists.size}`);
console.log(`missing parts 001-129: ${missingParts.join(',') || 'NONE'}`);
console.log(`missing lists 001-129: ${missingLists.join(',') || 'NONE'}`);
console.log(`warnings: ${warnings.length}`);
for (const w of warnings.slice(0, 20)) console.log('  ' + w);
