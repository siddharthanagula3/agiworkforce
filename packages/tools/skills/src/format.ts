
import type { Skill } from './types';

export interface FormatSkillsOptions {
  inlineBodies?: boolean;
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
