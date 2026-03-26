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
  Sparkles,
  MessageSquare,
  CheckCircle2,
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

const skillCategories = [
  {
    icon: Code,
    name: 'Engineering',
    color: 'from-cyan-500 to-teal-600',
    count: 26,
    skills: ['Code reviewer', 'Architecture planner', 'CI/CD pipeline builder', 'API designer'],
    description:
      'Software engineering specialists for code review, architecture, DevOps, and technical planning.',
  },
  {
    icon: Brain,
    name: 'AI & Data',
    color: 'from-purple-500 to-violet-600',
    count: 17,
    skills: ['ML pipeline builder', 'Data analyst', 'Prompt engineer', 'Model evaluator'],
    description:
      'AI and data science specialists for ML workflows, data analysis, and model evaluation.',
  },
  {
    icon: Megaphone,
    name: 'Marketing',
    color: 'from-pink-500 to-rose-600',
    count: 16,
    skills: ['Campaign strategist', 'SEO optimizer', 'Content calendar planner', 'Ad copywriter'],
    description:
      'Marketing automation for campaigns, SEO, content strategy, and performance analytics.',
  },
  {
    icon: Settings,
    name: 'Operations',
    color: 'from-slate-500 to-zinc-600',
    count: 15,
    skills: ['Process optimizer', 'Workflow automator', 'Resource allocator', 'SOP writer'],
    description:
      'Operations management for process optimization, workflow automation, and resource planning.',
  },
  {
    icon: DollarSign,
    name: 'Finance',
    color: 'from-emerald-500 to-green-600',
    count: 11,
    skills: ['Financial analyst', 'Budget forecaster', 'Invoice processor', 'Tax preparer'],
    description:
      'Financial modeling, budget forecasting, invoice processing, and tax preparation at scale.',
  },
  {
    icon: Monitor,
    name: 'IT & Operations',
    color: 'from-blue-500 to-indigo-600',
    count: 10,
    skills: ['System administrator', 'Security auditor', 'Incident responder', 'Network planner'],
    description:
      'IT infrastructure management, security auditing, incident response, and system monitoring.',
  },
  {
    icon: Headphones,
    name: 'Support',
    color: 'from-amber-500 to-orange-600',
    count: 9,
    skills: ['Ticket triager', 'Knowledge base writer', 'Escalation handler', 'CSAT analyst'],
    description:
      'Customer support automation for ticket triage, knowledge bases, and satisfaction analysis.',
  },
  {
    icon: Palette,
    name: 'Creative',
    color: 'from-fuchsia-500 to-pink-600',
    count: 8,
    skills: ['Copywriter', 'Video scriptwriter', 'Brand voice editor', 'Social media creator'],
    description:
      'Creative content generation for copy, video scripts, brand voice, and social media.',
  },
  {
    icon: UserCheck,
    name: 'Human Resources',
    color: 'from-teal-500 to-cyan-600',
    count: 6,
    skills: ['Resume screener', 'Onboarding planner', 'Policy drafter', 'Performance reviewer'],
    description:
      'HR automation for recruitment screening, onboarding, policy drafting, and performance reviews.',
  },
  {
    icon: Search,
    name: 'Research',
    color: 'from-indigo-500 to-blue-600',
    count: 5,
    skills: ['Literature reviewer', 'Competitive analyst', 'Market researcher', 'Trend forecaster'],
    description:
      'Research specialists for literature reviews, competitive analysis, and market intelligence.',
  },
  {
    icon: FileText,
    name: 'Documentation',
    color: 'from-stone-500 to-stone-600',
    count: 5,
    skills: ['Technical writer', 'API documenter', 'Changelog generator', 'Style guide enforcer'],
    description:
      'Documentation specialists for technical writing, API docs, and style guide enforcement.',
  },
  {
    icon: Zap,
    name: 'Automation',
    color: 'from-yellow-500 to-amber-600',
    count: 5,
    skills: ['Workflow builder', 'Integration connector', 'Scheduler', 'Event trigger designer'],
    description:
      'Automation specialists for building workflows, integrations, schedules, and event triggers.',
  },
  {
    icon: BarChart3,
    name: 'Analytics',
    color: 'from-sky-500 to-blue-600',
    count: 5,
    skills: ['Dashboard builder', 'KPI tracker', 'Report generator', 'Data visualizer'],
    description:
      'Analytics specialists for dashboards, KPI tracking, reporting, and data visualization.',
  },
  {
    icon: Scale,
    name: 'Legal',
    color: 'from-orange-500 to-red-600',
    count: 4,
    skills: ['Contract reviewer', 'Compliance auditor', 'Legal researcher', 'Policy draft writer'],
    description:
      'Legal automation for contract review, regulatory compliance, and legal document preparation.',
  },
  {
    icon: Briefcase,
    name: 'Executive',
    color: 'from-blue-400 to-blue-600',
    count: 4,
    skills: ['Executive assistant', 'Meeting summarizer', 'Board deck preparer', 'OKR tracker'],
    description:
      'Executive support for meeting summaries, board decks, OKR tracking, and strategic planning.',
  },
  {
    icon: ShoppingCart,
    name: 'Business',
    color: 'from-rose-500 to-pink-600',
    count: 4,
    skills: [
      'Business plan writer',
      'Pitch deck creator',
      'Partnership evaluator',
      'RFP responder',
    ],
    description:
      'Business development for plans, pitch decks, partnership evaluation, and RFP responses.',
  },
  {
    icon: GraduationCap,
    name: 'Education',
    color: 'from-violet-500 to-purple-600',
    count: 3,
    skills: ['Curriculum designer', 'AI tutor', 'Assessment creator'],
    description:
      'Education specialists for curriculum design, AI tutoring, and assessment creation.',
  },
  {
    icon: Users,
    name: 'Consulting',
    color: 'from-gray-500 to-zinc-600',
    count: 3,
    skills: ['Strategy consultant', 'Change management advisor', 'Process auditor'],
    description: 'Consulting specialists for strategy, change management, and process improvement.',
  },
  {
    icon: Leaf,
    name: 'Sustainability',
    color: 'from-green-500 to-emerald-600',
    count: 2,
    skills: ['ESG report writer', 'Carbon footprint analyst'],
    description: 'Sustainability specialists for ESG reporting and carbon footprint analysis.',
  },
  {
    icon: TrendingUp,
    name: 'Sales',
    color: 'from-red-500 to-rose-600',
    count: 2,
    skills: ['Lead qualifier', 'Sales email writer'],
    description: 'Sales specialists for lead qualification and outreach email generation.',
  },
  {
    icon: Package,
    name: 'Product',
    color: 'from-orange-500 to-amber-600',
    count: 2,
    skills: ['PRD writer', 'Feature prioritizer'],
    description:
      'Product management specialists for requirements documents and feature prioritization.',
  },
  {
    icon: Globe,
    name: 'Language',
    color: 'from-cyan-400 to-blue-500',
    count: 2,
    skills: ['Translator', 'Localization specialist'],
    description: 'Language specialists for translation and content localization across markets.',
  },
  {
    icon: PenTool,
    name: 'Design',
    color: 'from-pink-400 to-fuchsia-500',
    count: 1,
    skills: ['UI copy reviewer'],
    description: 'Design specialists for UI copy review and design system documentation.',
  },
];

const howItWorksSteps = [
  {
    step: 1,
    icon: Users,
    title: 'Choose a Skill',
    description:
      'Browse AI employees by category or search by the task you need done. Each skill is pre-configured with domain expertise.',
  },
  {
    step: 2,
    icon: MessageSquare,
    title: 'Describe Your Task',
    description:
      'Give natural language instructions — just like briefing a real employee. Attach files, set context, and specify your requirements.',
  },
  {
    step: 3,
    icon: Zap,
    title: 'AI Delivers Results',
    description:
      'Get polished documents, detailed analysis, completed tasks, or structured data — ready to use or iterate on.',
  },
];

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
      <div className="flex min-h-screen flex-col bg-black text-white">
        <Header />

        <main className="flex-1 pt-24">
          {/* Hero Section */}
          <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
            <div className="container relative mx-auto px-4 text-center">
              <div className="mb-8 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400 backdrop-blur-xs">
                <Sparkles className="mr-2 h-4 w-4" />
                Pre-Built AI Specialists
              </div>
              <h1 className="mx-auto max-w-4xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                AI Employees, Ready to Work
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                From healthcare to finance, legal to creative — pre-built AI specialists that handle
                real work across every industry.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/download"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-black"
                >
                  Download Desktop App
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="#skills"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-800 bg-black px-8 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                >
                  Browse All Skills
                </Link>
              </div>

              {/* Stats */}
              <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
                <div className="p-6">
                  <div className="mb-2 text-5xl font-bold text-blue-500">23</div>
                  <div className="text-lg text-zinc-400">Skill Categories</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Pre-built specialists ready to deploy
                  </p>
                </div>
                <div className="p-6">
                  <div className="mb-2 text-5xl font-bold text-blue-500">23</div>
                  <div className="text-lg text-zinc-400">Categories</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Engineering, marketing, finance, and more
                  </p>
                </div>
                <div className="p-6">
                  <div className="mb-2 text-5xl font-bold text-blue-500">Every</div>
                  <div className="text-lg text-zinc-400">Industry</div>
                  <p className="mt-2 text-sm text-zinc-600">Built for real work, not just code</p>
                </div>
              </div>
            </div>
          </section>

          {/* Skills Category Grid */}
          <section id="skills" className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  AI Employees by Category
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Every skill is a domain specialist — trained on industry workflows, terminology,
                  and best practices. Choose a category to explore.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {skillCategories.map((category) => (
                  <div
                    key={category.name}
                    className="group rounded-2xl border border-zinc-800 bg-black/50 p-8 transition-all hover:border-blue-500/50"
                  >
                    <div className="mb-5 flex items-center gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${category.color}`}
                      >
                        <category.icon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{category.name}</h3>
                        <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                          {category.count} skills
                        </span>
                      </div>
                    </div>
                    <p className="mb-4 text-sm leading-relaxed text-zinc-500">
                      {category.description}
                    </p>
                    <ul className="space-y-2">
                      {category.skills.map((skill) => (
                        <li key={skill} className="flex items-center gap-2 text-sm text-zinc-400">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                          {skill}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">How It Works</h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  From choosing a skill to getting results — three simple steps.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-3">
                {howItWorksSteps.map((item) => (
                  <div key={item.step} className="relative text-center">
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
                      <item.icon className="h-8 w-8 text-blue-500" />
                    </div>
                    <div className="mb-2 text-sm font-medium text-blue-400">Step {item.step}</div>
                    <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-zinc-400">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Comparison Section */}
          <section className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  Built for Real Work, Not Just Code
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Every competitor focuses on coding. AGI Workforce is the only platform with
                  non-coding AI skills across 23 categories.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="py-4 pr-6 text-left text-sm font-medium text-zinc-500">
                        Feature
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-blue-400">
                        AGI Workforce
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-zinc-500">
                        Claude Desktop
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-zinc-500">
                        ChatGPT
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-zinc-500">
                        Cursor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.feature} className="border-b border-zinc-800/50">
                        <td className="py-4 pr-6 text-sm text-zinc-400">{row.feature}</td>
                        <td className="px-6 py-4 text-sm font-medium text-white">{row.agi}</td>
                        <td className="px-6 py-4 text-sm text-zinc-500">{row.claude}</td>
                        <td className="px-6 py-4 text-sm text-zinc-500">{row.chatgpt}</td>
                        <td className="px-6 py-4 text-sm text-zinc-500">{row.cursor}</td>
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
