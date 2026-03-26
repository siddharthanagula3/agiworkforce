import Link from 'next/link';
import type { Metadata } from 'next';
import { MARKETING } from '@/lib/marketing-constants';
import {
  ArrowRight,
  Scale,
  DollarSign,
  GraduationCap,
  Palette,
  ShoppingCart,
  Briefcase,
  Users,
  Zap,
  Code,
  Brain,
  Megaphone,
  Settings,
  Monitor,
  Headphones,
  PenTool,
  UserCheck,
  Search,
  FileText,
  BarChart3,
  Leaf,
  TrendingUp,
  Package,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { Header } from '../../../components/layout/Header';
import { CtaSection } from '../../../components/marketing/CtaSection';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'AI Skills | AGI Workforce — AI Employees Across Multiple Categories',
  description:
    'Explore pre-built AI employee skills across engineering, AI & data, marketing, operations, finance, IT, support, creative, HR, and more. Real work, not just code.',
  keywords: [
    'AI skills',
    'AI employees',
    'AI workforce',
    'healthcare AI',
    'legal AI',
    'finance AI',
    'AI automation',
    'non-coding AI',
    'AI agents',
    'desktop AI app',
  ],
  openGraph: {
    title: 'AI Skills | AGI Workforce — Pre-Built AI Employees',
    description:
      'Pre-built AI specialists across 23 categories. From engineering to finance, marketing to creative — AI employees that handle real work.',
    type: 'website',
    url: 'https://agiworkforce.com/features/ai-skills',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce — AI Skills across 23 categories',
      },
    ],
  },
  alternates: {
    canonical: '/features/ai-skills',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Skills | AGI Workforce — Pre-Built AI Employees',
    description:
      'Pre-built AI specialists across 23 categories including engineering, marketing, finance, and more. Real work, not just code.',
    images: ['/app-preview.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AGI Workforce',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'macOS, Windows, Linux',
  description:
    'AI desktop application with pre-built AI employee skills across 23 categories including engineering, AI & data, marketing, operations, finance, IT, support, creative, HR, and more.',
  featureList: [
    'Pre-built AI employee skills',
    '23 skill categories',
    'Engineering AI specialists',
    'AI & data science tools',
    'Marketing automation',
    'Operations management',
    'Finance and accounting AI',
    'IT & operations support',
    'Creative content generation',
    'Human resources AI',
    'Research and analytics',
  ],
  url: 'https://agiworkforce.com/features/ai-skills',
};

interface SkillCategory {
  icon: LucideIcon;
  name: string;
  count: number;
  skills: string[];
}

const skillCategories: SkillCategory[] = [
  {
    icon: Code,
    name: 'Engineering',
    count: 26,
    skills: ['Code reviewer', 'Architecture planner', 'CI/CD pipeline builder', 'API designer'],
  },
  {
    icon: Brain,
    name: 'AI & Data',
    count: 17,
    skills: ['ML pipeline builder', 'Data analyst', 'Prompt engineer', 'Model evaluator'],
  },
  {
    icon: Megaphone,
    name: 'Marketing',
    count: 16,
    skills: ['Campaign strategist', 'SEO optimizer', 'Content calendar planner', 'Ad copywriter'],
  },
  {
    icon: Settings,
    name: 'Operations',
    count: 15,
    skills: ['Process optimizer', 'Workflow automator', 'Resource allocator', 'SOP writer'],
  },
  {
    icon: DollarSign,
    name: 'Finance',
    count: 11,
    skills: ['Financial analyst', 'Budget forecaster', 'Invoice processor', 'Tax preparer'],
  },
  {
    icon: Monitor,
    name: 'IT & Operations',
    count: 10,
    skills: ['System administrator', 'Security auditor', 'Incident responder', 'Network planner'],
  },
  {
    icon: Headphones,
    name: 'Support',
    count: 9,
    skills: ['Ticket triager', 'Knowledge base writer', 'Escalation handler', 'CSAT analyst'],
  },
  {
    icon: Palette,
    name: 'Creative',
    count: 8,
    skills: ['Copywriter', 'Video scriptwriter', 'Brand voice editor', 'Social media creator'],
  },
  {
    icon: UserCheck,
    name: 'Human Resources',
    count: 6,
    skills: ['Resume screener', 'Onboarding planner', 'Policy drafter', 'Performance reviewer'],
  },
  {
    icon: Search,
    name: 'Research',
    count: 5,
    skills: ['Literature reviewer', 'Competitive analyst', 'Market researcher', 'Trend forecaster'],
  },
  {
    icon: FileText,
    name: 'Documentation',
    count: 5,
    skills: ['Technical writer', 'API documenter', 'Changelog generator', 'Style guide enforcer'],
  },
  {
    icon: Zap,
    name: 'Automation',
    count: 5,
    skills: ['Workflow builder', 'Integration connector', 'Scheduler', 'Event trigger designer'],
  },
  {
    icon: BarChart3,
    name: 'Analytics',
    count: 5,
    skills: ['Dashboard builder', 'KPI tracker', 'Report generator', 'Data visualizer'],
  },
  {
    icon: Scale,
    name: 'Legal',
    count: 4,
    skills: ['Contract reviewer', 'Compliance auditor', 'Legal researcher', 'Policy draft writer'],
  },
  {
    icon: Briefcase,
    name: 'Executive',
    count: 4,
    skills: ['Executive assistant', 'Meeting summarizer', 'Board deck preparer', 'OKR tracker'],
  },
  {
    icon: ShoppingCart,
    name: 'Business',
    count: 4,
    skills: [
      'Business plan writer',
      'Pitch deck creator',
      'Partnership evaluator',
      'RFP responder',
    ],
  },
  {
    icon: GraduationCap,
    name: 'Education',
    count: 3,
    skills: ['Curriculum designer', 'AI tutor', 'Assessment creator'],
  },
  {
    icon: Users,
    name: 'Consulting',
    count: 3,
    skills: ['Strategy consultant', 'Change management advisor', 'Process auditor'],
  },
  {
    icon: Leaf,
    name: 'Sustainability',
    count: 2,
    skills: ['ESG report writer', 'Carbon footprint analyst'],
  },
  {
    icon: TrendingUp,
    name: 'Sales',
    count: 2,
    skills: ['Lead qualifier', 'Sales email writer'],
  },
  {
    icon: Package,
    name: 'Product',
    count: 2,
    skills: ['PRD writer', 'Feature prioritizer'],
  },
  {
    icon: Globe,
    name: 'Language',
    count: 2,
    skills: ['Translator', 'Localization specialist'],
  },
  {
    icon: PenTool,
    name: 'Design',
    count: 1,
    skills: ['UI copy reviewer'],
  },
];

const TOP_CATEGORIES = 8;
const topCategories = skillCategories.slice(0, TOP_CATEGORIES);
const remainingCount = skillCategories.length - TOP_CATEGORIES;
const remainingNames = skillCategories.slice(TOP_CATEGORIES).map((c) => c.name);

const comparisonRows = [
  {
    feature: 'Non-coding AI skills',
    agi: 'Extensive',
    claude: 'None',
    chatgpt: 'GPTs (community)',
    cursor: 'None',
  },
  {
    feature: 'Industry categories',
    agi: '23 categories',
    claude: 'Coding only',
    chatgpt: 'General chat',
    cursor: 'Code only',
  },
  {
    feature: 'Desktop app',
    agi: 'Native (Tauri)',
    claude: 'Electron',
    chatgpt: 'Web only',
    cursor: 'VS Code fork',
  },
  {
    feature: 'Multi-model support',
    agi: `${MARKETING.providers.display} providers`,
    claude: 'Claude only',
    chatgpt: 'GPT only',
    cursor: 'Multi-model',
  },
  {
    feature: 'Local LLM support',
    agi: 'Ollama + LM Studio',
    claude: 'No',
    chatgpt: 'No',
    cursor: 'No',
  },
  {
    feature: 'Desktop automation',
    agi: 'Full control',
    claude: 'Limited',
    chatgpt: 'None',
    cursor: 'Editor only',
  },
  {
    feature: 'Mobile companion',
    agi: 'iOS + Android',
    claude: 'None',
    chatgpt: 'Mobile app',
    cursor: 'None',
  },
  {
    feature: 'MCP tools',
    agi: 'Unlimited',
    claude: 'Limited',
    chatgpt: 'None',
    cursor: '40 tool cap',
  },
];

const webPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Skills - AGI Workforce',
  description: 'Non-coding AI skills across engineering, marketing, finance, operations, and more.',
  url: 'https://agiworkforce.com/features/ai-skills',
  isPartOf: { '@type': 'WebSite', name: 'AGI Workforce', url: 'https://agiworkforce.com' },
};

function CategoryRow({ category }: { category: SkillCategory }) {
  const Icon = category.icon;
  return (
    <div className="group flex items-start gap-4 border-b border-[#1a1917] py-4 last:border-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#1a1917] bg-[#0f0e0c]">
        <Icon className="h-4 w-4 text-[#888480]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-sm font-medium text-[#edebe8]">{category.name}</span>
          <span className="text-xs tabular-nums text-[#555150]">{category.count}</span>
        </div>
        <span className="text-sm text-[#555150] sm:hidden">/</span>
        <span className="hidden text-sm text-[#555150] sm:inline" aria-hidden="true">
          /
        </span>
        <p className="min-w-0 truncate text-sm text-[#888480]">{category.skills.join(', ')}</p>
      </div>
    </div>
  );
}

export default function AISkillsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
        <Header />

        <main className="flex-1 pt-24">
          {/* Hero */}
          <section className="py-20 md:py-28">
            <div className="mx-auto max-w-3xl px-6 text-center">
              <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
                AI Employees, Ready to Work
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-[#888480]">
                150+ pre-built specialists across 23 categories — engineering, finance, legal,
                creative, and 19 more.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/download"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#c8892a] px-7 text-sm font-medium text-[#09090b] transition-colors hover:bg-[#d49a3a]"
                >
                  Download Desktop App
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="#skills"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-[#1a1917] px-7 text-sm font-medium text-[#888480] transition-colors hover:border-[#333130] hover:text-[#edebe8]"
                >
                  Browse Skills
                </Link>
              </div>

              {/* Stats — single row */}
              <div className="mt-14 flex items-center justify-center gap-3 text-sm text-[#555150]">
                <span>
                  <span className="font-medium text-[#edebe8]">150+</span> Pre-Built Skills
                </span>
                <span aria-hidden="true">|</span>
                <span>
                  <span className="font-medium text-[#edebe8]">23</span> Categories
                </span>
                <span aria-hidden="true">|</span>
                <span>
                  <span className="font-medium text-[#edebe8]">6</span> Surfaces
                </span>
              </div>
            </div>
          </section>

          {/* Skill Categories — dense list */}
          <section id="skills" className="border-t border-[#1a1917] py-20">
            <div className="mx-auto max-w-2xl px-6">
              <h2 className="text-lg font-medium tracking-tight">Skills by category</h2>
              <p className="mt-2 text-sm text-[#555150]">
                Sorted by depth of coverage. Each skill ships with domain-specific system prompts,
                tool configurations, and output schemas.
              </p>

              <div className="mt-8">
                {topCategories.map((category) => (
                  <CategoryRow key={category.name} category={category} />
                ))}
              </div>

              <p className="mt-4 text-sm text-[#555150]">
                and {remainingCount} more — {remainingNames.join(', ')}.
              </p>
            </div>
          </section>

          {/* Before / After — replaces step 1-2-3 */}
          <section className="border-t border-[#1a1917] py-20">
            <div className="mx-auto max-w-3xl px-6">
              <h2 className="text-lg font-medium tracking-tight">What a skill actually does</h2>
              <p className="mt-2 text-sm text-[#555150]">
                A skill is not a prompt template. It configures the model, selects tools, and
                structures output for a specific domain task.
              </p>

              <div className="mt-10 grid gap-8 md:grid-cols-2">
                {/* Before */}
                <div className="rounded-lg border border-[#1a1917] bg-[#0f0e0c] p-6">
                  <div className="mb-4 text-xs font-medium uppercase tracking-wider text-[#555150]">
                    Without skill
                  </div>
                  <div className="space-y-3 font-mono text-sm leading-relaxed text-[#888480]">
                    <p className="text-[#edebe8]">&gt; Review this contract for risks</p>
                    <p>
                      Generic response. Misses jurisdiction-specific clauses. No structured output.
                      You spend 20 minutes reformatting.
                    </p>
                  </div>
                </div>

                {/* After */}
                <div className="rounded-lg border border-[#c8892a]/30 bg-[#0f0e0c] p-6">
                  <div className="mb-4 text-xs font-medium uppercase tracking-wider text-[#c8892a]">
                    With Legal &rarr; Contract Reviewer
                  </div>
                  <div className="space-y-3 font-mono text-sm leading-relaxed text-[#888480]">
                    <p className="text-[#edebe8]">&gt; Review this contract for risks</p>
                    <p>
                      Flags 3 liability clauses, cites relevant UCC sections, outputs a risk matrix
                      as structured JSON. Ready to paste into your memo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Comparison table */}
          <section className="border-t border-[#1a1917] py-20">
            <div className="mx-auto max-w-3xl px-6">
              <h2 className="text-lg font-medium tracking-tight">
                Built for real work, not just code
              </h2>
              <p className="mt-2 text-sm text-[#555150]">
                Every competitor focuses on coding. AGI Workforce is the only platform with
                non-coding AI skills across 23 categories.
              </p>

              <div className="mt-10 overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#1a1917]">
                      <th className="py-3 pr-6 text-left font-medium text-[#555150]">Feature</th>
                      <th className="px-4 py-3 text-left font-medium text-[#c8892a]">
                        AGI Workforce
                      </th>
                      <th className="px-4 py-3 text-left font-normal text-[#555150]">
                        Claude Desktop
                      </th>
                      <th className="px-4 py-3 text-left font-normal text-[#555150]">ChatGPT</th>
                      <th className="px-4 py-3 text-left font-normal text-[#555150]">Cursor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.feature} className="border-b border-[#1a1917]/50">
                        <td className="py-3 pr-6 text-[#888480]">{row.feature}</td>
                        <td className="px-4 py-3 font-medium text-[#edebe8]">{row.agi}</td>
                        <td className="px-4 py-3 text-[#555150]">{row.claude}</td>
                        <td className="px-4 py-3 text-[#555150]">{row.chatgpt}</td>
                        <td className="px-4 py-3 text-[#555150]">{row.cursor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <CtaSection
            icon="Layers"
            headline="Start With Any Skill Today"
            body="Download AGI Workforce and put AI employees to work — engineering, marketing, finance, creative, and beyond."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
