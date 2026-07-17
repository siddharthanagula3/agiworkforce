/**
 * @agiworkforce/skills
 *
 * Skill loader for AGI Workforce — reads markdown + YAML-frontmatter skill
 * files, resolves precedence across multiple layers, and formats the result
 * as a system-prompt block.
 *
 * Skill format (one file per skill, OpenClaw-compatible):
 *
 * ```markdown
 * ---
 * name: diffs
 * description: Use the diffs tool to produce real, shareable diffs.
 * ---
 *
 * When you need to show edits as a real diff, prefer the `diffs` tool...
 * ```
 *
 * Precedence (highest wins): extra > workspace > project > personal > managed-local > bundled.
 *
 * Pure: no plugin runtime, no global state. Runs in Node (uses `node:fs`).
 *
 * @packageDocumentation
 */

export type { Skill, SkillLayer, SkillMetadata, SkillSource } from './types';
export { parseFrontmatter } from './frontmatter';
export type { ParsedFrontmatter } from './frontmatter';
export { loadSkillsFromDir, loadSkillsFromLayers } from './loader';
export { mergeSkills } from './merge';
export { formatSkillsForPrompt } from './format';
export type { FormatSkillsOptions } from './format';
