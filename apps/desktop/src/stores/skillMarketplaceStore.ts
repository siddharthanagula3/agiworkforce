/**
 * Skill Marketplace Store
 *
 * Manages the 140+ AGI Workforce skills loaded via the `skill_list` Tauri command.
 * Skills are categorized client-side by inferring category from the skill name/description.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Shape returned by the `skill_list` Tauri command (camelCase per Tauri IPC rules). */
export interface SkillInfo {
  name: string;
  description: string;
  sourceType: string;
  requiresBins: string[];
  requiresEnv: string[];
  supportedOs: string[];
  allowedTools: string[];
  contextMode: string;
}

/** Result of invoking a skill. */
export interface SkillInvocationResult {
  skillName: string;
  instructions: string;
  allowedTools: string[];
  contextMode: string;
}

/** Result of checking skill requirements. */
export interface RequirementCheckResult {
  satisfied: boolean;
  missingBins: string[];
  missingEnv: string[];
  osSupported: boolean;
}

/** Skill match result from message matching. */
export interface SkillMatchResult {
  skillName: string;
  description: string;
  relevanceScore: number;
  matchReason: string;
}

/** Slash command definition. */
export interface SlashCommand {
  name: string;
  description: string;
}

/** Frontend-augmented skill with derived category and active state. */
export interface MarketplaceSkill extends SkillInfo {
  category: SkillCategory;
  isActive: boolean;
}

export type SkillCategory =
  | 'all'
  | 'healthcare'
  | 'legal'
  | 'finance'
  | 'education'
  | 'creative'
  | 'trades'
  | 'e-commerce'
  | 'technology'
  | 'productivity';

export type ViewMode = 'grid' | 'list';

// ── Category detection ─────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<Exclude<SkillCategory, 'all'>, string[]> = {
  healthcare: [
    'health',
    'medical',
    'clinical',
    'patient',
    'nurse',
    'doctor',
    'pharma',
    'diagnosis',
    'therapy',
    'mental',
    'wellness',
    'hospital',
    'care',
  ],
  legal: [
    'legal',
    'law',
    'contract',
    'compliance',
    'attorney',
    'paralegal',
    'regulation',
    'policy',
    'court',
    'litigation',
    'intellectual',
  ],
  finance: [
    'finance',
    'financial',
    'accounting',
    'tax',
    'investment',
    'budget',
    'banking',
    'trading',
    'portfolio',
    'audit',
    'payroll',
    'bookkeeping',
  ],
  education: [
    'education',
    'learning',
    'teaching',
    'curriculum',
    'student',
    'academic',
    'training',
    'tutoring',
    'assessment',
    'school',
    'course',
    'lesson',
  ],
  creative: [
    'creative',
    'writing',
    'design',
    'art',
    'music',
    'video',
    'photo',
    'content',
    'story',
    'brand',
    'marketing',
    'copywriting',
    'ux',
  ],
  trades: [
    'trade',
    'construction',
    'plumbing',
    'electrical',
    'hvac',
    'carpentry',
    'engineering',
    'manufacturing',
    'logistics',
    'supply',
    'maintenance',
  ],
  'e-commerce': [
    'ecommerce',
    'e-commerce',
    'shop',
    'product',
    'inventory',
    'order',
    'customer',
    'retail',
    'sales',
    'marketplace',
    'listing',
    'pricing',
  ],
  technology: [
    'code',
    'software',
    'developer',
    'engineer',
    'git',
    'database',
    'api',
    'cloud',
    'devops',
    'security',
    'testing',
    'debug',
    'deploy',
  ],
  productivity: [
    'productivity',
    'workflow',
    'task',
    'project',
    'management',
    'schedule',
    'meeting',
    'email',
    'report',
    'analysis',
    'research',
    'summary',
  ],
};

function inferCategory(skill: SkillInfo): Exclude<SkillCategory, 'all'> {
  const haystack = `${skill.name} ${skill.description}`.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => haystack.includes(kw))) {
      return category as Exclude<SkillCategory, 'all'>;
    }
  }

  return 'productivity';
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface SkillMarketplaceState {
  skills: MarketplaceSkill[];
  slashCommands: SlashCommand[];
  skillCount: number;
  isLoading: boolean;
  error: string | null;
  selectedCategory: SkillCategory;
  searchQuery: string;
  viewMode: ViewMode;
  expandedSkillName: string | null;

  // Core actions
  fetchSkills: () => Promise<void>;
  reloadSkills: () => Promise<void>;
  setCategory: (category: SkillCategory) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setExpandedSkill: (name: string | null) => void;
  toggleSkillActive: (name: string) => void;

  // Newly wired skill commands
  getSkill: (name: string) => Promise<SkillInfo | null>;
  getSkillInstructions: (name: string) => Promise<string | null>;
  checkRequirements: (name: string) => Promise<RequirementCheckResult | null>;
  invokeSkill: (name: string, args: string) => Promise<SkillInvocationResult>;
  matchForMessage: (content: string) => Promise<SkillMatchResult[]>;
  parseSlashCommand: (input: string) => Promise<SkillInvocationResult | null>;
  fetchSlashCommands: () => Promise<SlashCommand[]>;
  fetchSkillCount: () => Promise<number>;
  setWorkspace: (path: string | null) => Promise<void>;
  getContext: () => Promise<string>;
}

export const useSkillMarketplaceStore = create<SkillMarketplaceState>()(
  devtools(
    (set, get) => ({
      skills: [],
      slashCommands: [],
      skillCount: 0,
      isLoading: false,
      error: null,
      selectedCategory: 'all',
      searchQuery: '',
      viewMode: 'grid',
      expandedSkillName: null,

      fetchSkills: async () => {
        if (get().isLoading) return;
        set({ isLoading: true, error: null });
        try {
          const raw = await invoke<SkillInfo[]>('skill_list');
          const skills: MarketplaceSkill[] = raw.map((s) => ({
            ...s,
            category: inferCategory(s),
            isActive: false,
          }));
          set({ skills, isLoading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to load skills',
            isLoading: false,
          });
        }
      },

      reloadSkills: async () => {
        try {
          await invoke('skill_reload');
        } catch {
          // Non-fatal — proceed to re-fetch regardless
        }
        set({ skills: [], isLoading: false, error: null });
        await get().fetchSkills();
      },

      setCategory: (category) => set({ selectedCategory: category }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setViewMode: (viewMode) => set({ viewMode }),
      setExpandedSkill: (expandedSkillName) => set({ expandedSkillName }),

      toggleSkillActive: (name) => {
        set((state) => ({
          skills: state.skills.map((s) => (s.name === name ? { ...s, isActive: !s.isActive } : s)),
        }));
      },

      // ── Newly wired skill commands ────────────────────────────────────

      getSkill: async (name) => {
        try {
          return await invoke<SkillInfo | null>('skill_get', { name });
        } catch {
          return null;
        }
      },

      getSkillInstructions: async (name) => {
        try {
          return await invoke<string | null>('skill_get_instructions', { name });
        } catch {
          return null;
        }
      },

      checkRequirements: async (name) => {
        try {
          return await invoke<RequirementCheckResult | null>('skill_check_requirements', { name });
        } catch {
          return null;
        }
      },

      invokeSkill: async (name, arguments_) => {
        try {
          return await invoke<SkillInvocationResult>('skill_invoke', {
            name,
            arguments: arguments_,
          });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to invoke skill' });
          throw err;
        }
      },

      matchForMessage: async (content) => {
        try {
          return await invoke<SkillMatchResult[]>('skill_match_for_message', { content });
        } catch {
          return [];
        }
      },

      parseSlashCommand: async (input) => {
        try {
          const result = await invoke<SkillInvocationResult | null>('skill_parse_slash_command', {
            input,
          });
          return result;
        } catch {
          return null;
        }
      },

      fetchSlashCommands: async () => {
        try {
          const commands = await invoke<SlashCommand[]>('skill_get_slash_commands');
          set({ slashCommands: commands });
          return commands;
        } catch {
          return [];
        }
      },

      fetchSkillCount: async () => {
        try {
          const count = await invoke<number>('skill_count');
          set({ skillCount: count });
          return count;
        } catch {
          return 0;
        }
      },

      setWorkspace: async (path) => {
        try {
          await invoke('skill_set_workspace', { path });
          // Refresh skills after workspace change
          await get().fetchSkills();
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to set workspace' });
        }
      },

      getContext: async () => {
        try {
          return await invoke<string>('skill_get_context');
        } catch {
          return '';
        }
      },
    }),
    { name: 'skill-marketplace' },
  ),
);

// ── Selectors ──────────────────────────────────────────────────────────────────

/** Returns skills filtered by the current category and search query. */
export function selectFilteredSkills(state: SkillMarketplaceState): MarketplaceSkill[] {
  const { skills, selectedCategory, searchQuery } = state;
  const query = searchQuery.trim().toLowerCase();

  return skills.filter((skill) => {
    const categoryMatch = selectedCategory === 'all' || skill.category === selectedCategory;
    const searchMatch =
      query === '' ||
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query);
    return categoryMatch && searchMatch;
  });
}

/** Returns counts per category for the filter sidebar labels. */
export function selectCategoryCounts(state: SkillMarketplaceState): Record<SkillCategory, number> {
  const { skills } = state;
  const counts: Record<SkillCategory, number> = {
    all: skills.length,
    healthcare: 0,
    legal: 0,
    finance: 0,
    education: 0,
    creative: 0,
    trades: 0,
    'e-commerce': 0,
    technology: 0,
    productivity: 0,
  };
  for (const skill of skills) {
    counts[skill.category] = (counts[skill.category] ?? 0) + 1;
  }
  return counts;
}
