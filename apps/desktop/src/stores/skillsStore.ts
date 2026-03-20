/**
 * Skills Store
 *
 * Manages the skills marketplace state: browsing, filtering, install/uninstall.
 * Skills are prompt-based instruction sets (à la SKILL.md) that extend the
 * agent's capabilities in a specific domain.
 *
 * Uses Zustand v5 devtools middleware (no persistence — refreshed on load).
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ── Types ────────────────────────────────────────────────────────────────────

export type SkillCategory =
  | 'all'
  | 'coding'
  | 'marketing'
  | 'legal'
  | 'sales'
  | 'research'
  | 'writing'
  | 'finance'
  | 'support';

export type SkillFilter = 'all' | 'mine' | 'examples';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: Exclude<SkillCategory, 'all'>;
  author: string;
  isExample: boolean;
  isInstalled: boolean;
  icon: string;
  usageCount: number;
  tags: string[];
}

// ── Example skills (hardcoded 15+) ──────────────────────────────────────────

const EXAMPLE_SKILLS: Skill[] = [
  {
    id: 'create-skill',
    name: 'Create Skill',
    description:
      'Generates a new SKILL.md file from a plain-English description. Scaffolds name, description, prompt template, and example invocations.',
    category: 'coding',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'Sparkles',
    usageCount: 8412,
    tags: ['productivity', 'scaffolding'],
  },
  {
    id: 'marketing-competitive-analysis',
    name: 'Marketing Competitive Analysis',
    description:
      'Researches competitors, identifies positioning gaps, and produces a structured competitive landscape report with SWOT and differentiation opportunities.',
    category: 'marketing',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'TrendingUp',
    usageCount: 6203,
    tags: ['strategy', 'research', 'competitive'],
  },
  {
    id: 'data-exploration',
    name: 'Data Exploration',
    description:
      'Ingests CSV, JSON, or SQL query results and produces summary statistics, distribution charts, and anomaly flags with plain-English narrative.',
    category: 'research',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'BarChart2',
    usageCount: 5891,
    tags: ['analytics', 'data', 'visualization'],
  },
  {
    id: 'legal-contract-review',
    name: 'Legal Contract Review',
    description:
      'Scans contracts for unusual clauses, missing standard provisions, liability exposure, and jurisdiction-specific red flags. Outputs structured risk summary.',
    category: 'legal',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'FileText',
    usageCount: 4720,
    tags: ['legal', 'risk', 'contracts'],
  },
  {
    id: 'cx-ticket-triage',
    name: 'CX Ticket Triage',
    description:
      'Classifies incoming support tickets by urgency, sentiment, and topic. Suggests canned responses, escalation paths, and SLA breach predictions.',
    category: 'support',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'Headphones',
    usageCount: 4108,
    tags: ['support', 'automation', 'triage'],
  },
  {
    id: 'sales-prep',
    name: 'Sales Call Prep',
    description:
      'Given a prospect name and company, researches their recent news, funding, org chart, and pain points. Outputs a tailored talk-track with discovery questions.',
    category: 'sales',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'Phone',
    usageCount: 3977,
    tags: ['sales', 'research', 'outreach'],
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description:
      'Performs a structured code review: checks logic correctness, security vulnerabilities, performance anti-patterns, test coverage gaps, and style consistency.',
    category: 'coding',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'Code2',
    usageCount: 7654,
    tags: ['code', 'quality', 'security'],
  },
  {
    id: 'debug-assistant',
    name: 'Debug Assistant',
    description:
      'Analyzes stack traces, error logs, and reproduction steps to identify root cause. Suggests minimal reproducible examples and targeted fixes.',
    category: 'coding',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'Bug',
    usageCount: 6821,
    tags: ['debugging', 'troubleshooting', 'code'],
  },
  {
    id: 'api-tester',
    name: 'API Tester',
    description:
      'Generates curl commands, Postman collections, and edge-case test scenarios for any REST or GraphQL API spec. Validates responses against OpenAPI schemas.',
    category: 'coding',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'Zap',
    usageCount: 3340,
    tags: ['api', 'testing', 'development'],
  },
  {
    id: 'content-writer',
    name: 'Content Writer',
    description:
      'Drafts long-form blog posts, landing page copy, and social media content from a brief. Matches specified tone, reading level, and SEO keywords.',
    category: 'writing',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'PenLine',
    usageCount: 5512,
    tags: ['writing', 'content', 'seo'],
  },
  {
    id: 'seo-optimizer',
    name: 'SEO Optimizer',
    description:
      'Audits existing pages against top-3 SERP results: identifies keyword gaps, meta tag issues, heading hierarchy problems, and internal linking opportunities.',
    category: 'marketing',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'Search',
    usageCount: 2983,
    tags: ['seo', 'marketing', 'content'],
  },
  {
    id: 'financial-analyst',
    name: 'Financial Analyst',
    description:
      'Processes income statements, balance sheets, and cash-flow data to compute key ratios, identify trends, and produce an executive summary with risk flags.',
    category: 'finance',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'DollarSign',
    usageCount: 2741,
    tags: ['finance', 'analysis', 'reporting'],
  },
  {
    id: 'meeting-summarizer',
    name: 'Meeting Summarizer',
    description:
      'Converts meeting transcripts into structured summaries: key decisions, action items with owners, open questions, and a next-steps timeline.',
    category: 'writing',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'ClipboardList',
    usageCount: 6109,
    tags: ['productivity', 'meetings', 'summary'],
  },
  {
    id: 'email-drafter',
    name: 'Email Drafter',
    description:
      'Writes professional emails from bullet points. Supports multiple tones (formal, friendly, firm), handles replies, and generates subject-line variants.',
    category: 'writing',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'Mail',
    usageCount: 7289,
    tags: ['email', 'writing', 'communication'],
  },
  {
    id: 'research-assistant',
    name: 'Research Assistant',
    description:
      'Conducts multi-source research on any topic: finds primary sources, synthesizes conflicting viewpoints, and produces a citation-backed literature summary.',
    category: 'research',
    author: 'AGI Workforce',
    isExample: true,
    isInstalled: false,
    icon: 'BookOpen',
    usageCount: 5033,
    tags: ['research', 'analysis', 'citations'],
  },
];

// ── Store ────────────────────────────────────────────────────────────────────

interface SkillsState {
  skills: Skill[];
  filter: SkillFilter;
  categoryFilter: SkillCategory;
  searchQuery: string;
  isLoading: boolean;

  // Derived (computed in selectors — not stored)
  installSkill: (skillId: string) => void;
  uninstallSkill: (skillId: string) => void;
  setFilter: (filter: SkillFilter) => void;
  setCategoryFilter: (category: SkillCategory) => void;
  setSearch: (query: string) => void;
}

export const useSkillsStore = create<SkillsState>()(
  devtools(
    (set) => ({
      skills: EXAMPLE_SKILLS,
      filter: 'all',
      categoryFilter: 'all',
      searchQuery: '',
      isLoading: false,

      installSkill: (skillId) => {
        set(
          (state) => ({
            skills: state.skills.map((s) => (s.id === skillId ? { ...s, isInstalled: true } : s)),
          }),
          false,
          'skills/install',
        );
      },

      uninstallSkill: (skillId) => {
        set(
          (state) => ({
            skills: state.skills.map((s) => (s.id === skillId ? { ...s, isInstalled: false } : s)),
          }),
          false,
          'skills/uninstall',
        );
      },

      setFilter: (filter) => {
        set({ filter }, false, 'skills/setFilter');
      },

      setCategoryFilter: (categoryFilter) => {
        set({ categoryFilter }, false, 'skills/setCategoryFilter');
      },

      setSearch: (searchQuery) => {
        set({ searchQuery }, false, 'skills/setSearch');
      },
    }),
    { name: 'skills' },
  ),
);
