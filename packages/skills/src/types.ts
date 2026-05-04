/**
 * Skill type definitions.
 *
 * A "skill" is a reusable instruction/context block (markdown body + YAML
 * frontmatter) the agent can be told about. Skills are NOT tools — they're
 * model-readable hints that change how the agent approaches a task. The
 * agent decides whether to read/follow them based on the description.
 *
 * Format mirrors OpenClaw's skill format (`extensions/<plugin>/skills/<id>/SKILL.md`):
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
 * Optional metadata fields are loosely typed and OpenClaw-compatible.
 */

/** Where in the precedence stack a skill came from. Higher index wins. */
export type SkillSource =
  | 'bundled'
  | 'managed-local'
  | 'personal'
  | 'project'
  | 'workspace'
  | 'extra';

/** Optional metadata pulled from frontmatter. All fields are optional. */
export interface SkillMetadata {
  /** Always inject — skip eligibility filtering. */
  always?: boolean;
  /** Stable key, defaults to `name` if omitted. */
  skillKey?: string;
  /** Primary env var that must be set for the skill to be eligible. */
  primaryEnv?: string;
  /** Display emoji. */
  emoji?: string;
  /** Homepage / docs URL. */
  homepage?: string;
  /** OS list this skill applies to (`darwin`, `linux`, `win32`). */
  os?: string[];
  /** Eligibility requirements (binaries on PATH, env vars, config keys). */
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
}

/** A loaded skill with its body + metadata. */
export interface Skill {
  /** Skill name (from frontmatter `name`). */
  name: string;
  /** One-line description (from frontmatter `description`). */
  description: string;
  /** Markdown body following the closing `---`. */
  body: string;
  /** Where on disk this skill came from. */
  filePath: string;
  /** Precedence source. */
  source: SkillSource;
  /** Loose-typed extra frontmatter fields. */
  metadata: SkillMetadata;
  /** All raw frontmatter key/value pairs (for round-tripping). */
  frontmatter: Record<string, unknown>;
}

/** A directory layer that supplies skills, with a precedence label. */
export interface SkillLayer {
  /** Filesystem path to scan. May contain `<skill-id>/SKILL.md` or flat `*.md` files. */
  rootDir: string;
  /** Precedence source. */
  source: SkillSource;
}
