#!/usr/bin/env node
// Scans .ts/.tsx source files for icon-only buttons and TreeItems that lack
// an aria-label or accessible label nearby. Emits a Markdown report.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const ROOT = join(SCRIPT_DIR, '..');
const SRC_DIR = join(ROOT, 'src');
const REPORT_DIR = join(ROOT, 'docs');
const REPORT_PATH = join(REPORT_DIR, 'a11y-audit-2026-05-15.md');

// Patterns that suggest an icon-only interactive element
const ICON_BUTTON_RE = /vscode\.\w*[Ii]con\w*Button|createButton\s*\(|IconButton/g;
const TREE_ITEM_ICON_RE = /new\s+vscode\.TreeItem\s*\(|iconPath\s*=/g;

// Patterns that indicate an accessible label is present nearby (within ±5 lines)
const ARIA_LABEL_RE = /aria[_-]?label|accessibilityInformation|label\s*:/i;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function checkFile(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const findings = [];

  const checkPattern = (re, label) => {
    let m;
    const reCopy = new RegExp(re.source, re.flags);
    while ((m = reCopy.exec(src)) !== null) {
      const charIdx = m.index;
      const lineNum = src.slice(0, charIdx).split('\n').length;
      const windowStart = Math.max(0, lineNum - 6);
      const windowEnd = Math.min(lines.length, lineNum + 5);
      const window = lines.slice(windowStart, windowEnd).join('\n');
      if (!ARIA_LABEL_RE.test(window)) {
        findings.push({
          line: lineNum,
          pattern: label,
          snippet: lines[lineNum - 1].trim().slice(0, 100),
        });
      }
    }
  };

  checkPattern(ICON_BUTTON_RE, 'icon-button');
  checkPattern(TREE_ITEM_ICON_RE, 'TreeItem-icon');
  return findings;
}

function run() {
  const files = walk(SRC_DIR);
  const allFindings = [];

  for (const f of files) {
    const findings = checkFile(f);
    if (findings.length > 0) {
      allFindings.push({ file: relative(ROOT, f), findings });
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const totalFiles = files.length;
  const totalFindings = allFindings.reduce((s, r) => s + r.findings.length, 0);

  let md = `# a11y Audit — VS Code Extension\n\n`;
  md += `Date: ${date}  \n`;
  md += `Files scanned: ${totalFiles}  \n`;
  md += `Findings: ${totalFindings}\n\n`;

  if (totalFindings === 0) {
    md += `## Result\n\nNo findings — all detected icon-buttons and TreeItem icon sites have an accessible label nearby.\n`;
  } else {
    md += `## Findings\n\n`;
    md += `These sites use icon-only buttons or icon-bearing TreeItems without a detectable \`aria-label\` or \`accessibilityInformation\` within ±5 lines. Review each manually.\n\n`;
    for (const { file, findings } of allFindings) {
      md += `### \`${file}\`\n\n`;
      md += `| Line | Pattern | Snippet |\n`;
      md += `| ---- | ------- | ------- |\n`;
      for (const { line, pattern, snippet } of findings) {
        const escaped = snippet.replace(/\|/g, '\\|');
        md += `| ${line} | ${pattern} | \`${escaped}\` |\n`;
      }
      md += `\n`;
    }
    md += `## Next steps\n\n`;
    md += `- Add \`accessibilityInformation: { label: '…' }\` to each flagged \`TreeItem\`.\n`;
    md += `- Add \`aria-label="…"\` or a tooltip to each flagged icon button in webview HTML.\n`;
    md += `- Re-run this script after fixes; target: 0 findings.\n`;
  }

  // Ensure docs/ exists
  try {
    statSync(REPORT_DIR);
  } catch {
    import('fs').then(({ mkdirSync }) => mkdirSync(REPORT_DIR));
  }
  writeFileSync(REPORT_PATH, md, 'utf8');

  console.log(`Scanned ${totalFiles} files. Findings: ${totalFindings}`);
  console.log(`Report written to ${REPORT_PATH}`);
}

run();
