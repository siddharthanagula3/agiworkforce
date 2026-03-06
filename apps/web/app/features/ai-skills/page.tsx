import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Stethoscope,
  Scale,
  DollarSign,
  GraduationCap,
  Palette,
  Target,
  Wrench,
  ShoppingCart,
  Briefcase,
  Sparkles,
  MessageSquare,
  CheckCircle2,
  Users,
  Layers,
  Zap,
} from 'lucide-react';
import { Header } from '../../../components/layout/Header';
import { CtaSection } from '../../../components/marketing/CtaSection';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'AI Skills | AGI Workforce — 140 AI Employees Across 9 Industries',
  description:
    'Explore 140+ pre-built AI employee skills across healthcare, legal, finance, education, creative, sales, engineering, e-commerce, and general business. Real work, not just code.',
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
    title: 'AI Skills | AGI Workforce — 140 AI Employees',
    description:
      '140+ pre-built AI specialists across 9 industries. From healthcare to finance, legal to creative — AI employees that handle real work.',
    type: 'website',
    url: 'https://agiworkforce.com/features/ai-skills',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce — 140 AI Skills across 9 industries',
      },
    ],
  },
  alternates: {
    canonical: '/features/ai-skills',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Skills | AGI Workforce — 140 AI Employees',
    description:
      '140+ pre-built AI specialists across healthcare, legal, finance, and more. Real work, not just code.',
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
    'AI desktop application with 140+ pre-built AI employee skills across 9 industries including healthcare, legal, finance, education, creative, sales, engineering, e-commerce, and general business.',
  featureList: [
    '140+ AI employee skills',
    '9 industry categories',
    'Healthcare and medical AI specialists',
    'Legal and compliance AI assistants',
    'Finance and accounting AI tools',
    'Education and training AI support',
    'Creative and content AI generation',
    'Sales and marketing AI automation',
    'Engineering and trades AI planning',
    'E-commerce and retail AI operations',
    'General business AI workforce',
  ],
  url: 'https://agiworkforce.com/features/ai-skills',
};

const skillCategories = [
  {
    icon: Stethoscope,
    name: 'Healthcare & Medical',
    color: 'from-red-500 to-rose-600',
    count: 18,
    skills: [
      'Medical coder',
      'Clinical trial analyst',
      'Patient intake processor',
      'Diagnosis research assistant',
    ],
    description:
      'AI specialists trained on medical workflows, coding standards, and clinical documentation.',
  },
  {
    icon: Scale,
    name: 'Legal & Compliance',
    color: 'from-amber-500 to-orange-600',
    count: 16,
    skills: ['Contract reviewer', 'Compliance auditor', 'Legal researcher', 'Policy draft writer'],
    description:
      'Automate contract review, regulatory compliance checks, and legal document preparation.',
  },
  {
    icon: DollarSign,
    name: 'Finance & Accounting',
    color: 'from-emerald-500 to-green-600',
    count: 17,
    skills: ['Financial analyst', 'Tax preparer', 'Invoice processor', 'Budget forecaster'],
    description:
      'Financial modeling, tax preparation, invoice processing, and budget analysis at scale.',
  },
  {
    icon: GraduationCap,
    name: 'Education & Training',
    color: 'from-blue-500 to-indigo-600',
    count: 15,
    skills: ['Curriculum designer', 'AI tutor', 'Assessment creator', 'Learning path builder'],
    description:
      'Design curricula, create assessments, build personalized learning paths, and tutor students.',
  },
  {
    icon: Palette,
    name: 'Creative & Content',
    color: 'from-purple-500 to-violet-600',
    count: 16,
    skills: ['Copywriter', 'Social media manager', 'Video scriptwriter', 'Brand voice editor'],
    description:
      'Content creation, social media management, video scripts, and brand-consistent copywriting.',
  },
  {
    icon: Target,
    name: 'Sales & Marketing',
    color: 'from-pink-500 to-rose-600',
    count: 15,
    skills: ['Lead qualifier', 'Email campaign writer', 'Market researcher', 'Competitive analyst'],
    description:
      'Qualify leads, write campaigns, research markets, and analyze competitive landscapes.',
  },
  {
    icon: Wrench,
    name: 'Engineering & Trades',
    color: 'from-cyan-500 to-teal-600',
    count: 14,
    skills: ['Project estimator', 'Safety inspector', 'Maintenance planner', 'Permit reviewer'],
    description:
      'Project estimation, safety inspections, maintenance scheduling, and permit documentation.',
  },
  {
    icon: ShoppingCart,
    name: 'E-Commerce & Retail',
    color: 'from-orange-500 to-amber-600',
    count: 14,
    skills: [
      'Product description writer',
      'Inventory analyst',
      'Customer support agent',
      'Pricing optimizer',
    ],
    description:
      'Product listings, inventory management, customer support, and dynamic pricing analysis.',
  },
  {
    icon: Briefcase,
    name: 'General Business',
    color: 'from-blue-400 to-blue-600',
    count: 15,
    skills: [
      'Executive assistant',
      'Meeting summarizer',
      'Data entry specialist',
      'Report generator',
    ],
    description:
      'Executive support, meeting notes, data entry automation, and business report generation.',
  },
];

const howItWorksSteps = [
  {
    step: 1,
    icon: Users,
    title: 'Choose a Skill',
    description:
      'Browse 140+ AI employees by category or search by the task you need done. Each skill is pre-configured with domain expertise.',
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
    agi: '140+',
    claude: 'None',
    chatgpt: 'GPTs (community)',
    cursor: 'None',
  },
  {
    feature: 'Industry categories',
    agi: '9 industries',
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
    agi: '9+ providers',
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
  description: '140+ non-coding AI skills across healthcare, legal, finance, education, and more.',
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
                140+ Pre-Built AI Specialists
              </div>
              <h1 className="mx-auto max-w-4xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                140 AI Employees, Ready to Work
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
                  <div className="mb-2 text-5xl font-bold text-blue-500">140+</div>
                  <div className="text-lg text-zinc-400">AI Skills</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Pre-built specialists ready to deploy
                  </p>
                </div>
                <div className="p-6">
                  <div className="mb-2 text-5xl font-bold text-blue-500">9</div>
                  <div className="text-lg text-zinc-400">Categories</div>
                  <p className="mt-2 text-sm text-zinc-600">Healthcare, legal, finance, and more</p>
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
                  Every competitor focuses on coding. AGI Workforce is the only platform with 140+
                  non-coding AI skills across 9 industries.
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
            icon={Layers}
            headline="Start With Any Skill Today"
            body="Download AGI Workforce and put 140 AI employees to work — healthcare, legal, finance, creative, and beyond."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
