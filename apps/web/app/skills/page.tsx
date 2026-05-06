'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Search,
  Plus,
  Code,
  FileText,
  Mail,
  MessageSquare,
  Sparkles,
  GitBranch,
  Bug,
  Zap,
  Scale,
  DollarSign,
  GraduationCap,
  ShoppingCart,
  Briefcase,
  Users,
  Monitor,
  Headphones,
  PenTool,
  UserCheck,
  BarChart3,
  Leaf,
  TrendingUp,
  Package,
  Globe,
  Brain,
  Megaphone,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Badge } from '@shared/ui/badge';
import { cn } from '@shared/lib/utils';

// ─── Prompts data (sourced from PromptShortcuts catalog) ───────────────────────

interface PromptItem {
  id: string;
  name: string;
  description: string;
  trigger: string;
  tags: string[];
  icon: LucideIcon;
}

const PROMPTS: PromptItem[] = [
  {
    id: 'code-review',
    name: 'Review my code',
    description: 'Review code for best practices, potential bugs, and improvements.',
    trigger: '/review',
    tags: ['coding'],
    icon: Code,
  },
  {
    id: 'debug-error',
    name: 'Debug this error',
    description: 'Debug an error and explain what is wrong.',
    trigger: '/debug',
    tags: ['coding'],
    icon: Bug,
  },
  {
    id: 'explain-code',
    name: 'Explain this code',
    description: 'Explain what code does in simple terms.',
    trigger: '/explain',
    tags: ['coding'],
    icon: Code,
  },
  {
    id: 'optimize-code',
    name: 'Optimize code',
    description: 'Optimize code for better performance and readability.',
    trigger: '/optimize',
    tags: ['coding'],
    icon: Zap,
  },
  {
    id: 'improve-writing',
    name: 'Improve my writing',
    description: 'Improve text for clarity, grammar, and professionalism.',
    trigger: '/improve',
    tags: ['writing'],
    icon: FileText,
  },
  {
    id: 'summarize',
    name: 'Summarize this',
    description: 'Provide a concise summary of the provided content.',
    trigger: '/summarize',
    tags: ['writing'],
    icon: MessageSquare,
  },
  {
    id: 'write-email',
    name: 'Write an email',
    description: 'Write a professional email on a given topic.',
    trigger: '/email',
    tags: ['writing', 'business'],
    icon: Mail,
  },
  {
    id: 'business-plan',
    name: 'Create business plan',
    description: 'Build out a structured business plan.',
    trigger: '/bizplan',
    tags: ['business'],
    icon: GitBranch,
  },
  {
    id: 'market-research',
    name: 'Market research',
    description: 'Research a market, competitors, or industry landscape.',
    trigger: '/research',
    tags: ['business', 'analysis'],
    icon: Search,
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm ideas',
    description: 'Generate creative ideas on any topic.',
    trigger: '/brainstorm',
    tags: ['creative'],
    icon: Sparkles,
  },
  {
    id: 'generate-content',
    name: 'Generate content',
    description: 'Generate engaging content for any audience or format.',
    trigger: '/content',
    tags: ['creative', 'writing'],
    icon: Sparkles,
  },
];

// ─── Agents data (sourced from AI Skills catalog) ─────────────────────────────

interface AgentItem {
  id: string;
  name: string;
  description: string;
  trigger: string;
  tags: string[];
  icon: LucideIcon;
}

const AGENTS: AgentItem[] = [
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Reviews code for correctness, security, and best practices.',
    trigger: '/engineer',
    tags: ['engineering'],
    icon: Code,
  },
  {
    id: 'arch-planner',
    name: 'Architecture Planner',
    description: 'Plans system architecture, diagrams, and tech decisions.',
    trigger: '/architect',
    tags: ['engineering'],
    icon: GitBranch,
  },
  {
    id: 'cicd-builder',
    name: 'CI/CD Pipeline Builder',
    description: 'Builds and optimises CI/CD workflows for any stack.',
    trigger: '/pipeline',
    tags: ['engineering', 'automation'],
    icon: Zap,
  },
  {
    id: 'api-designer',
    name: 'API Designer',
    description: 'Designs REST, GraphQL, and gRPC API contracts.',
    trigger: '/api',
    tags: ['engineering', 'developer'],
    icon: Code,
  },
  {
    id: 'ml-pipeline',
    name: 'ML Pipeline Builder',
    description: 'Builds end-to-end machine learning pipelines.',
    trigger: '/ml',
    tags: ['ai', 'data'],
    icon: Brain,
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Runs exploratory data analysis and surfaces insights.',
    trigger: '/analyze',
    tags: ['ai', 'data', 'analysis'],
    icon: BarChart3,
  },
  {
    id: 'prompt-engineer',
    name: 'Prompt Engineer',
    description: 'Crafts and optimises prompts for any model.',
    trigger: '/prompt',
    tags: ['ai'],
    icon: Brain,
  },
  {
    id: 'campaign-strategist',
    name: 'Campaign Strategist',
    description: 'Plans multi-channel marketing campaigns.',
    trigger: '/campaign',
    tags: ['marketing'],
    icon: Megaphone,
  },
  {
    id: 'seo-optimizer',
    name: 'SEO Optimizer',
    description: 'Audits pages and produces keyword and link strategies.',
    trigger: '/seo',
    tags: ['marketing'],
    icon: TrendingUp,
  },
  {
    id: 'ad-copywriter',
    name: 'Ad Copywriter',
    description: 'Writes high-converting ad copy for any channel.',
    trigger: '/adcopy',
    tags: ['marketing', 'creative'],
    icon: Megaphone,
  },
  {
    id: 'process-optimizer',
    name: 'Process Optimizer',
    description: 'Maps and streamlines business processes.',
    trigger: '/process',
    tags: ['operations'],
    icon: Settings,
  },
  {
    id: 'sop-writer',
    name: 'SOP Writer',
    description: 'Writes standard operating procedures for any workflow.',
    trigger: '/sop',
    tags: ['operations', 'documentation'],
    icon: FileText,
  },
  {
    id: 'financial-analyst',
    name: 'Financial Analyst',
    description: 'Builds financial models and interprets reports.',
    trigger: '/finance',
    tags: ['finance'],
    icon: DollarSign,
  },
  {
    id: 'budget-forecaster',
    name: 'Budget Forecaster',
    description: 'Forecasts budgets and spending trends.',
    trigger: '/forecast',
    tags: ['finance'],
    icon: DollarSign,
  },
  {
    id: 'sysadmin',
    name: 'System Administrator',
    description: 'Manages infrastructure, configs, and deployments.',
    trigger: '/sysadmin',
    tags: ['it'],
    icon: Monitor,
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Audits systems for vulnerabilities and misconfigurations.',
    trigger: '/security',
    tags: ['it'],
    icon: Monitor,
  },
  {
    id: 'ticket-triager',
    name: 'Ticket Triager',
    description: 'Classifies and routes support tickets intelligently.',
    trigger: '/triage',
    tags: ['support'],
    icon: Headphones,
  },
  {
    id: 'kb-writer',
    name: 'Knowledge Base Writer',
    description: 'Writes help articles and FAQ entries.',
    trigger: '/kb',
    tags: ['support', 'documentation'],
    icon: FileText,
  },
  {
    id: 'copywriter',
    name: 'Copywriter',
    description: 'Writes compelling brand and marketing copy.',
    trigger: '/copy',
    tags: ['creative', 'writing'],
    icon: PenTool,
  },
  {
    id: 'scriptwriter',
    name: 'Video Scriptwriter',
    description: 'Scripts videos from concept to final draft.',
    trigger: '/script',
    tags: ['creative'],
    icon: PenTool,
  },
  {
    id: 'resume-screener',
    name: 'Resume Screener',
    description: 'Screens and scores resumes against job criteria.',
    trigger: '/hr',
    tags: ['hr'],
    icon: UserCheck,
  },
  {
    id: 'policy-drafter',
    name: 'Policy Drafter',
    description: 'Drafts HR and compliance policies.',
    trigger: '/policy',
    tags: ['hr', 'legal'],
    icon: FileText,
  },
  {
    id: 'lit-reviewer',
    name: 'Literature Reviewer',
    description: 'Reviews academic literature and summarises findings.',
    trigger: '/litreview',
    tags: ['research'],
    icon: Search,
  },
  {
    id: 'competitive-analyst',
    name: 'Competitive Analyst',
    description: 'Analyses competitors and market positioning.',
    trigger: '/compete',
    tags: ['research', 'business'],
    icon: Search,
  },
  {
    id: 'tech-writer',
    name: 'Technical Writer',
    description: 'Writes technical documentation for any audience.',
    trigger: '/docs',
    tags: ['documentation'],
    icon: FileText,
  },
  {
    id: 'changelog-gen',
    name: 'Changelog Generator',
    description: 'Generates changelogs from commits and release notes.',
    trigger: '/changelog',
    tags: ['documentation', 'developer'],
    icon: FileText,
  },
  {
    id: 'workflow-builder',
    name: 'Workflow Builder',
    description: 'Designs automation workflows and trigger logic.',
    trigger: '/workflow',
    tags: ['automation'],
    icon: Zap,
  },
  {
    id: 'dashboard-builder',
    name: 'Dashboard Builder',
    description: 'Designs KPI dashboards and metrics views.',
    trigger: '/dashboard',
    tags: ['analytics'],
    icon: BarChart3,
  },
  {
    id: 'contract-reviewer',
    name: 'Contract Reviewer',
    description: 'Reviews contracts for risk and missing clauses.',
    trigger: '/contract',
    tags: ['legal'],
    icon: Scale,
  },
  {
    id: 'compliance-auditor',
    name: 'Compliance Auditor',
    description: 'Audits processes and systems for regulatory compliance.',
    trigger: '/compliance',
    tags: ['legal', 'it'],
    icon: Scale,
  },
  {
    id: 'exec-assistant',
    name: 'Executive Assistant',
    description: 'Drafts emails, prepares agendas, and handles scheduling.',
    trigger: '/exec',
    tags: ['executive'],
    icon: Briefcase,
  },
  {
    id: 'meeting-summarizer',
    name: 'Meeting Summarizer',
    description: 'Summarises meeting transcripts into action items.',
    trigger: '/meeting',
    tags: ['executive', 'productivity'],
    icon: MessageSquare,
  },
  {
    id: 'biz-plan-writer',
    name: 'Business Plan Writer',
    description: 'Writes comprehensive business plans with financials.',
    trigger: '/bizplan2',
    tags: ['business'],
    icon: Briefcase,
  },
  {
    id: 'pitch-deck',
    name: 'Pitch Deck Creator',
    description: 'Creates investor pitch decks from briefs.',
    trigger: '/pitch',
    tags: ['business', 'creative'],
    icon: Briefcase,
  },
  {
    id: 'curriculum-designer',
    name: 'Curriculum Designer',
    description: 'Designs learning curricula and assessment plans.',
    trigger: '/curriculum',
    tags: ['education'],
    icon: GraduationCap,
  },
  {
    id: 'ai-tutor',
    name: 'AI Tutor',
    description: 'Personalised tutoring across subjects and skill levels.',
    trigger: '/tutor',
    tags: ['education'],
    icon: GraduationCap,
  },
  {
    id: 'strategy-consultant',
    name: 'Strategy Consultant',
    description: 'Advises on business strategy and growth plans.',
    trigger: '/strategy',
    tags: ['consulting'],
    icon: Users,
  },
  {
    id: 'esg-writer',
    name: 'ESG Report Writer',
    description: 'Writes sustainability and ESG disclosure reports.',
    trigger: '/esg',
    tags: ['sustainability'],
    icon: Leaf,
  },
  {
    id: 'lead-qualifier',
    name: 'Lead Qualifier',
    description: 'Scores and qualifies sales leads from CRM data.',
    trigger: '/qualify',
    tags: ['sales'],
    icon: TrendingUp,
  },
  {
    id: 'prd-writer',
    name: 'PRD Writer',
    description: 'Writes product requirements documents from briefs.',
    trigger: '/prd',
    tags: ['product'],
    icon: Package,
  },
  {
    id: 'translator',
    name: 'Translator',
    description: 'Translates content across 50+ languages with context.',
    trigger: '/translate',
    tags: ['language'],
    icon: Globe,
  },
  {
    id: 'ui-copy',
    name: 'UI Copy Reviewer',
    description: 'Reviews and rewrites UI copy for clarity and tone.',
    trigger: '/uicopy',
    tags: ['design', 'creative'],
    icon: PenTool,
  },
  {
    id: 'content-calendar',
    name: 'Content Calendar Planner',
    description: 'Plans multi-channel content calendars for any period.',
    trigger: '/calendar',
    tags: ['marketing', 'creative'],
    icon: Megaphone,
  },
  {
    id: 'shopify-specialist',
    name: 'Shopify Specialist',
    description: 'Manages products, orders, and store optimisation.',
    trigger: '/shopify',
    tags: ['business', 'finance'],
    icon: ShoppingCart,
  },
  {
    id: 'model-evaluator',
    name: 'Model Evaluator',
    description: 'Evaluates LLM outputs against defined rubrics.',
    trigger: '/eval',
    tags: ['ai', 'data'],
    icon: Brain,
  },
];

// ─── Tab type ──────────────────────────────────────────────────────────────────

type TabValue = 'prompts' | 'agents';

// ─── SkillCard ─────────────────────────────────────────────────────────────────

interface SkillCardProps {
  name: string;
  description: string;
  trigger: string;
  tags: string[];
  icon: LucideIcon;
}

function SkillCard({ name, description, trigger, tags, icon: Icon }: SkillCardProps) {
  return (
    <div className="group flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/[0.10] hover:bg-white/[0.04]">
      <div className="mb-2.5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04]">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="font-mono text-[10px] text-muted-foreground/60">{trigger}</p>
        </div>
      </div>
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground/80">{description}</p>
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="border-white/[0.06] px-1.5 py-0 text-[10px] text-muted-foreground"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SkillsPage ────────────────────────────────────────────────────────────────

function SkillsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState('');

  const rawTab = searchParams.get('tab');
  const activeTab: TabValue = rawTab === 'agents' ? 'agents' : 'prompts';

  const setActiveTab = (tab: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'prompts') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const filteredPrompts = useMemo(() => {
    if (!searchQuery) return PROMPTS;
    const q = searchQuery.toLowerCase();
    return PROMPTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q)) ||
        p.trigger.includes(q),
    );
  }, [searchQuery]);

  const filteredAgents = useMemo(() => {
    if (!searchQuery) return AGENTS;
    const q = searchQuery.toLowerCase();
    return AGENTS.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.tags.some((t) => t.includes(q)) ||
        a.trigger.includes(q),
    );
  }, [searchQuery]);

  const displayItems = activeTab === 'prompts' ? filteredPrompts : filteredAgents;
  const totalCount = activeTab === 'prompts' ? PROMPTS.length : AGENTS.length;

  return (
    <div className="min-h-full bg-background">
      {/* Page Header */}
      <div className="border-b border-white/[0.06] bg-black/20 px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Skills</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Quick-access prompts and specialist AI agents for every domain.
              </p>
            </div>
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add skill
            </Button>
          </div>

          {/* Tabs + Search */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Tabs */}
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5">
              {(['prompts', 'agents'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-all duration-150',
                    activeTab === tab
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={activeTab === tab}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 border-white/[0.08] bg-white/[0.04] pl-9 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Results count */}
        <p className="mb-4 text-xs text-muted-foreground">
          {searchQuery
            ? `${displayItems.length} of ${totalCount} ${activeTab}`
            : `${totalCount} ${activeTab}`}
        </p>

        {/* Grid */}
        {displayItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {displayItems.map((item) => (
              <SkillCard
                key={item.id}
                name={item.name}
                description={item.description}
                trigger={item.trigger}
                tags={item.tags}
                icon={item.icon}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
              <Search className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground">No {activeTab} found</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search term.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsPageInner />
    </Suspense>
  );
}
