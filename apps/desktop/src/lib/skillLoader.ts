export interface LoadedSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  tools: string[];
  model: string;
  expertise: string[];
  systemPrompt: string;
  avatar?: string;
  price?: number;
}

interface FrontmatterData {
  [key: string]: unknown;
}

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

function parseSimpleYaml(yaml: string): FrontmatterData {
  const result: FrontmatterData = {};
  const lines = yaml.split('\n');
  let currentKey = '';
  let currentArray: string[] | null = null;

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }

    const arrayItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayItemMatch && currentKey) {
      const captured = arrayItemMatch[1];
      if (captured) {
        if (!currentArray) {
          currentArray = [];
        }
        const val = captured.trim().replace(/^['"]|['"]$/g, '');
        currentArray.push(val);
        result[currentKey] = currentArray;
      }
      continue;
    }

    if (currentArray && currentKey) {
      result[currentKey] = currentArray;
      currentArray = null;
    }

    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1] ?? '';
      const rawValue = (kvMatch[2] ?? '').trim();
      currentKey = key;

      if (rawValue === '' || rawValue === '|' || rawValue === '>') {
        currentArray = null;
        continue;
      }

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

      if (/^\d+(\.\d+)?$/.test(rawValue)) {
        result[currentKey] = Number(rawValue);
        currentArray = null;
        continue;
      }

      if (rawValue === 'true' || rawValue === 'false') {
        result[currentKey] = rawValue === 'true';
        currentArray = null;
        continue;
      }

      result[currentKey] = rawValue.replace(/^['"]|['"]$/g, '');
      currentArray = null;
    }
  }

  return result;
}

let cachedSkills: LoadedSkill[] | null = null;
let cacheTimestamp = 0;

const CACHE_TTL_MS = 5 * 60 * 1000;

const employeeFiles: Record<string, string> = import.meta.glob('../data/employees/*.md', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

function filePathToId(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? '';
  return fileName.replace(/\.md$/, '');
}

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

  skills.sort((a, b) => a.name.localeCompare(b.name));

  cachedSkills = skills;
  cacheTimestamp = now;

  return skills;
}

export function getSkillById(id: string): LoadedSkill | undefined {
  const skills = loadSkills();
  return skills.find((s) => s.id === id);
}

export function getSkillByName(name: string): LoadedSkill | undefined {
  const skills = loadSkills();
  const lower = name.toLowerCase();
  return skills.find((s) => s.name.toLowerCase() === lower);
}

export function getSkillCategories(): string[] {
  const skills = loadSkills();
  const categories = new Set(skills.map((s) => s.category));
  return Array.from(categories).sort();
}

export function invalidateSkillCache(): void {
  cachedSkills = null;
  cacheTimestamp = 0;
}

export async function loadFilesystemSkills(
  layers: Array<{ rootDir: string; source: import('@agiworkforce/skills').SkillSource }>,
): Promise<import('@agiworkforce/skills').Skill[]> {
  if (typeof window !== 'undefined' && typeof process === 'undefined') {
    return [];
  }
  const skillsPkg = await import('@agiworkforce/skills');
  const layerResults = await skillsPkg.loadSkillsFromLayers(layers);
  return skillsPkg.mergeSkills(layerResults);
}

export async function formatFilesystemSkills(
  skills: import('@agiworkforce/skills').Skill[],
  options?: import('@agiworkforce/skills').FormatSkillsOptions,
): Promise<string> {
  const skillsPkg = await import('@agiworkforce/skills');
  return skillsPkg.formatSkillsForPrompt(skills, options);
}
