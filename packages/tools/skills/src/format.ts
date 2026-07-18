/**
 * Format loaded skills as a system-prompt block.
 *
 * Output shape (mirrors OpenClaw's `formatSkillsForPrompt` XML envelope):
 *
 * ```xml
 * <available_skills>
 *   <skill>
 *     <name>diffs</name>
 *     <description>Use the diffs tool to produce real, shareable diffs.</description>
 *     <location>/path/to/skill.md</location>
 *   </skill>
 *   <skill>...</skill>
 * </available_skills>
 * ```
 *
 * This legacy formatter is for trusted host-local flows that intentionally
 * expose local locations. Model-facing Cloud flows must use
 * `formatSkillsForToolPrompt`, which never includes locations or bodies.
 *
 * If `inlineBodies: true` is passed, full body text is included inside each
 * `<skill>` block — useful for short prompts or test fixtures, but burns
 * tokens.
 */

import type { Skill } from './types';

export interface FormatSkillsOptions {
  /** Inline skill bodies (default: false — list-only). */
  inlineBodies?: boolean;
  /** Optional filter: only include skills matching this allowlist. */
  allowlist?: ReadonlySet<string>;
}

function escapeXml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function formatSkillsForPrompt(skills: Skill[], options: FormatSkillsOptions = {}): string {
  const filtered = options.allowlist
    ? skills.filter((s) => options.allowlist!.has(s.name))
    : skills;
  if (filtered.length === 0) {
    return '';
  }
  const blocks = filtered.map((skill) => {
    const parts = [
      `  <skill>`,
      `    <name>${escapeXml(skill.name)}</name>`,
      `    <description>${escapeXml(skill.description)}</description>`,
      `    <location>${escapeXml(skill.filePath)}</location>`,
    ];
    if (options.inlineBodies && skill.body) {
      parts.push(`    <body>${escapeXml(skill.body)}</body>`);
    }
    parts.push(`  </skill>`);
    return parts.join('\n');
  });
  return ['<available_skills>', ...blocks, '</available_skills>'].join('\n');
}
