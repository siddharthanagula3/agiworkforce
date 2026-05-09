/**
 * Skill Loader for Desktop App
 *
 * Loads AI employee skill definitions from bundled .md files using Vite's
 * import.meta.glob(). Parses YAML frontmatter to extract skill metadata
 * (name, description, category, tools, expertise) and the markdown body
 * as the systemPrompt.
 *
 * Uses a 5-minute cache to avoid re-parsing on every access.
 *
 * Filesystem-resident skills (user-authored under `<project>/.claude/skills/`,
 * `~/.claude/skills/`, etc.) load through the shared `@agiworkforce/skills`
 * package — see `loadFilesystemSkills()` below. The two paths intentionally
 * coexist: the bundled employees ship with the desktop binary, while user
 * skills live on disk and merge in via precedence (highest wins).
 *
 * @deprecated The bundled-only `loadSkills()` API will be retired once
 * the `appStateStore` slice for skill catalogs lands. New consumers should
 * prefer `loadFilesystemSkills()` for layered loading.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** Parsed skill definition from a .md employee file. */
export interface LoadedSkill {
  /** Unique identifier derived from filename (e.g. "3d-artist") */
  id: string;
  /** Human-readable name from frontmatter */
  name: string;
  /** Description of the skill's capabilities */
  description: string;
  /** Category for UI grouping (e.g. "Technical", "Creative", "Finance") */
  category: string;
  /** Tools available to this skill */
  tools: string[];
  /** LLM model preference */
  model: string;
  /** Expertise areas for matching */
  expertise: string[];
  /** Full system prompt (markdown body after frontmatter) */
  systemPrompt: string;
  /** Optional avatar */
  avatar?: string;
  /** Optional price */
  price?: number;
}

// ── Lightweight YAML Frontmatter Parser ────────────────────────────────────────

/** Parsed frontmatter result with typed data accessors. */
interface FrontmatterData {
  [key: string]: unknown;
}

/**
 * Extracts YAML frontmatter and markdown body from a string.
 * Expects the format: `---\n...yaml...\n---\nmarkdown body`
 */
function parseFrontmatter(content: string): { data: FrontmatterData; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    return { data: {}, body: content };
  }

  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { data: {}, body: content };
  }

  const yamlBlock = trimmed.slice(4, endIndex);
  const body = trimmed.slice(endIndex + 4).trim();
  const data = parseSimpleYaml(yamlBlock);

  return { data, body };
}

/**
 * Parses simple YAML (the subset used by employee frontmatter).
 * Supports: string values, arrays (both inline and block), numbers.
 */
function parseSimpleYaml(yaml: string): FrontmatterData {
  const result: FrontmatterData = {};
  const lines = yaml.split('\n');
  let currentKey = '';
  let currentArray: string[] | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }

    // Check for array item (indented with "- ")
    const arrayItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayItemMatch && currentKey) {
      const captured = arrayItemMatch[1];
      if (captured) {
        if (!currentArray) {
          currentArray = [];
        }
        // Strip quotes from array values
        const val = captured.trim().replace(/^['"]|['"]$/g, '');
        currentArray.push(val);
        result[currentKey] = currentArray;
      }
      continue;
    }

    // Save any pending array before processing new key
    if (currentArray && currentKey) {
      result[currentKey] = currentArray;
      currentArray = null;
    }

    // Check for key: value pair
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1] ?? '';
      const rawValue = (kvMatch[2] ?? '').trim();
      currentKey = key;

      if (rawValue === '' || rawValue === '|' || rawValue === '>') {
        // Value will come as array items or multi-line (treat as empty for now)
        currentArray = null;
        continue;
      }

      // Parse inline arrays: [item1, item2]
      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const items = rawValue
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
        result[currentKey] = items;
        currentArray = null;
        continue;
      }

      // Parse numbers
      if (/^\d+(\.\d+)?$/.test(rawValue)) {
        result[currentKey] = Number(rawValue);
        currentArray = null;
        continue;
      }

      // Parse booleans
      if (rawValue === 'true' || rawValue === 'false') {
        result[currentKey] = rawValue === 'true';
        currentArray = null;
        continue;
      }

      // String value (strip quotes)
      result[currentKey] = rawValue.replace(/^['"]|['"]$/g, '');
      currentArray = null;
    }
  }

  return result;
}

// ── Skill Loading ──────────────────────────────────────────────────────────────

/** Cache for loaded skills */
let cachedSkills: LoadedSkill[] | null = null;
let cacheTimestamp = 0;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Eagerly import all employee .md files via Vite's import.meta.glob.
 * The `eager: true` + `query: '?raw'` flags load file contents as strings
 * at build time, so no async loading is needed at runtime.
 */
const employeeFiles: Record<string, string> = import.meta.glob('../data/employees/*.md', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

/**
 * Extracts a skill ID from a file path.
 * e.g. "../data/employees/3d-artist.md" -> "3d-artist"
 */
function filePathToId(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? '';
  return fileName.replace(/\.md$/, '');
}

/**
 * Safely retrieves a string value from frontmatter data.
 */
function getString(data: FrontmatterData, key: string, fallback: string): string {
  const val = data[key];
  return typeof val === 'string' ? val : fallback;
}

/**
 * Loads and parses all AI employee skills from the bundled .md files.
 * Results are cached for 5 minutes.
 *
 * @param forceRefresh - Bypass cache and reload from source
 * @returns Array of parsed skill definitions
 */
export function loadSkills(forceRefresh = false): LoadedSkill[] {
  const now = Date.now();

  // Return cached results if still valid
  if (!forceRefresh && cachedSkills && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSkills;
  }

  const skills: LoadedSkill[] = [];

  for (const [filePath, rawContent] of Object.entries(employeeFiles)) {
    try {
      const { data, body } = parseFrontmatter(rawContent);

      const name = getString(data, 'name', filePathToId(filePath));
      const description = getString(data, 'description', '');
      const category = getString(data, 'category', 'Other');
      const model = getString(data, 'model', 'inherit');

      // Tools: support both YAML arrays and comma-separated strings
      let tools: string[] = [];
      const rawTools = data['tools'];
      if (Array.isArray(rawTools)) {
        tools = rawTools.map(String);
      } else if (typeof rawTools === 'string') {
        tools = rawTools
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      }

      // Expertise: YAML array
      let expertise: string[] = [];
      const rawExpertise = data['expertise'];
      if (Array.isArray(rawExpertise)) {
        expertise = rawExpertise.map(String);
      }

      const rawAvatar = data['avatar'];
      const rawPrice = data['price'];

      skills.push({
        id: filePathToId(filePath),
        name,
        description,
        category,
        tools,
        model,
        expertise,
        systemPrompt: body,
        avatar: typeof rawAvatar === 'string' ? rawAvatar : undefined,
        price: typeof rawPrice === 'number' ? rawPrice : undefined,
      });
    } catch (err) {
      console.warn(`[skillLoader] Failed to parse ${filePath}:`, err);
    }
  }

  // Sort alphabetically by name for consistent UI ordering
  skills.sort((a, b) => a.name.localeCompare(b.name));

  // Cache results
  cachedSkills = skills;
  cacheTimestamp = now;

  return skills;
}

/**
 * Finds a skill by its ID (filename without .md extension).
 * Useful for resolving @mentions like "@3d-artist" to the full skill.
 */
export function getSkillById(id: string): LoadedSkill | undefined {
  const skills = loadSkills();
  return skills.find((s) => s.id === id);
}

/**
 * Finds a skill by its name (case-insensitive).
 */
export function getSkillByName(name: string): LoadedSkill | undefined {
  const skills = loadSkills();
  const lower = name.toLowerCase();
  return skills.find((s) => s.name.toLowerCase() === lower);
}

/**
 * Returns all unique categories present across loaded skills.
 */
export function getSkillCategories(): string[] {
  const skills = loadSkills();
  const categories = new Set(skills.map((s) => s.category));
  return Array.from(categories).sort();
}

/**
 * Invalidates the skill cache, forcing a reload on next access.
 */
export function invalidateSkillCache(): void {
  cachedSkills = null;
  cacheTimestamp = 0;
}

// ── Filesystem-Resident Skills (via @agiworkforce/skills) ──────────────────────

/**
 * Layered skill loader powered by the shared `@agiworkforce/skills` package.
 *
 * Reads SKILL.md / *.md files from one or more directories, resolves
 * frontmatter (with prototype-pollution defense), and merges across six
 * precedence layers (extra > workspace > project > personal > managed-local
 * > bundled). The shared package depends on `node:fs/promises`, so this
 * function is only callable from a Node environment (Tauri sidecar, build
 * scripts, tests) — in a browser/renderer build the dynamic import will
 * fail. Guarded with a runtime-environment check; returns `[]` on web.
 *
 * Progressive disclosure: only metadata loads at session start. Bodies are
 * available on the returned `Skill[]` for on-demand access — UIs that show
 * a skill list should defer rendering the body until the user opens it.
 */
export async function loadFilesystemSkills(
  layers: Array<{ rootDir: string; source: import('@agiworkforce/skills').SkillSource }>,
): Promise<import('@agiworkforce/skills').Skill[]> {
  // Browser / renderer guard: `@agiworkforce/skills` uses `node:fs`. If we
  // ever land a Tauri-fs-backed shim, this guard moves into the package.
  if (typeof window !== 'undefined' && typeof process === 'undefined') {
    return [];
  }
  const skillsPkg = await import('@agiworkforce/skills');
  const layerResults = await skillsPkg.loadSkillsFromLayers(layers);
  return skillsPkg.mergeSkills(layerResults);
}

/**
 * Format filesystem skills as a system-prompt block. Used when generating
 * the agent's session-start system reminder.
 */
export async function formatFilesystemSkills(
  skills: import('@agiworkforce/skills').Skill[],
  options?: import('@agiworkforce/skills').FormatSkillsOptions,
): Promise<string> {
  const skillsPkg = await import('@agiworkforce/skills');
  return skillsPkg.formatSkillsForPrompt(skills, options);
}
