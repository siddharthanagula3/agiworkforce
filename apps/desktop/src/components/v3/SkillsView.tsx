import { useState } from 'react';
import { Code2, Edit2, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── skills data ───────────────────────────────────────────────────────────────

interface Skill {
  id: string;
  name: string;
  tone: string;
  icon: string;
  triggers: string[];
  version: string;
  addedAgo: string;
  usedCount: number;
  scope: string;
  compatible: string[];
  description: string;
  whatItDoes: string;
  whenInvoked: string[];
  howItWorks: string;
  tips: string;
  size: string;
  license: string;
  author: string;
}

const SKILLS: Skill[] = [
  {
    id: 'algorithmic-art',
    name: 'Algorithmic Art',
    tone: '#7c3aed',
    icon: '✦',
    triggers: ['generate art', 'algorithmic', 'code art', 'creative code'],
    version: '1.0.2',
    addedAgo: '3 days ago',
    usedCount: 12,
    scope: 'All chats',
    compatible: ['Opus 4.7', 'Sonnet 4.6'],
    description: 'Generate creative visual art through code — SVG, canvas, or p5.js.',
    whatItDoes:
      'Turns a creative brief into runnable generative-art code (SVG, HTML Canvas, or p5.js). Handles parametric control, color theory, and animation loops.',
    whenInvoked: [
      'User asks to "create art" or "visualize" something abstract',
      'Requests for patterns, fractals, or generative visuals',
      'Code-art challenges or creative explorations',
    ],
    howItWorks:
      '1. Identifies the visual idiom (geometric, organic, data-driven).\n2. Picks the best output format (SVG for vector, Canvas for animation).\n3. Returns runnable, self-contained code with inline comments.',
    tips: 'Pass `style: minimal` for clean black-and-white output. Combine with `web-artifacts-builder` to embed in a page.',
    size: '4.1 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
  {
    id: 'brand-guidelines',
    name: 'Brand Guidelines',
    tone: '#0891b2',
    icon: '◉',
    triggers: ['brand', 'guidelines', 'brand voice', 'style guide'],
    version: '2.1.0',
    addedAgo: '1 week ago',
    usedCount: 27,
    scope: 'All chats',
    compatible: ['Opus 4.7', 'Sonnet 4.6', 'GPT-5.1'],
    description: 'Enforce brand voice, tone, and visual rules across all outputs.',
    whatItDoes:
      'Loads brand rules from your settings and silently enforces them — approved vocabulary, tone register, color names, and formatting standards.',
    whenInvoked: [
      'Any output that will be published externally',
      'Requests mentioning "on-brand", "brand voice", or "style guide"',
      'Content destined for marketing channels',
    ],
    howItWorks:
      '1. Reads your brand profile (set in Settings → Brand).\n2. Applies vocabulary and tone filters.\n3. Flags deviations before returning.',
    tips: 'Upload your brand guide PDF in Settings → Brand for best results.',
    size: '2.8 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
  {
    id: 'canvas-design',
    name: 'Canvas Design',
    tone: '#ea580c',
    icon: '▣',
    triggers: ['design', 'layout', 'canvas', 'figma-like', 'mockup'],
    version: '1.3.1',
    addedAgo: '5 days ago',
    usedCount: 19,
    scope: 'All chats',
    compatible: ['Opus 4.7', 'Sonnet 4.6'],
    description: 'Produce HTML/CSS layout mockups and design-system-aware components.',
    whatItDoes:
      'Generates pixel-perfect HTML/CSS components and page layouts. Understands spacing systems, type scales, and design tokens.',
    whenInvoked: [
      'User asks for a "mockup", "layout", or "UI component"',
      'Design critique or iteration requests',
      'Requests mentioning Tailwind, CSS Grid, or design systems',
    ],
    howItWorks:
      '1. Parses the visual intent.\n2. Maps to semantic HTML with utility-first classes.\n3. Returns a self-contained artifact ready for preview.',
    tips: 'Pair with `web-artifacts-builder` to get a live preview.',
    size: '3.7 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
  {
    id: 'doc-coauthoring',
    name: 'Doc Co-Authoring',
    tone: '#0284c7',
    icon: '✎',
    triggers: ['document', 'coauthor', 'draft doc', 'write with me', 'collaborate'],
    version: '1.6.0',
    addedAgo: '2 weeks ago',
    usedCount: 61,
    scope: 'All chats',
    compatible: ['Opus 4.7', 'Sonnet 4.6', 'GPT-5.1'],
    description: 'Turn a rough outline into a polished, structured document.',
    whatItDoes:
      'Acts as a co-author — maintaining document context across turns, enforcing structure, and writing in your established voice.',
    whenInvoked: [
      'Long-form writing requests (reports, specs, proposals)',
      'Requests to "continue", "expand", or "refine" a draft',
      'Iterative document work across multiple messages',
    ],
    howItWorks:
      '1. Builds a document model from your outline.\n2. Maintains section continuity across messages.\n3. Returns structured Markdown with front-matter.',
    tips: 'Pair with `humanizer` for a final pass. Pass `format: formal` for board-facing content.',
    size: '5.4 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
  {
    id: 'humanizer',
    name: 'Humanizer',
    tone: '#059669',
    icon: '♡',
    triggers: ['humanize', 'rewrite', 'polish', 'make it sound human', 'less AI-ish', 'edit pass'],
    version: '1.4.0',
    addedAgo: '12 days ago',
    usedCount: 38,
    scope: 'All chats',
    compatible: ['Opus 4.7', 'Sonnet 4.6', 'GPT-5.1'],
    description:
      'Rewrites AI-flavored prose into copy that reads like a thoughtful person wrote it.',
    whatItDoes:
      'Rewrites AI-flavored prose into copy that reads like a thoughtful person wrote it — fewer hedges, livelier verbs, and natural rhythm without losing meaning.',
    whenInvoked: [
      'The user asks to rewrite, edit, or polish a passage',
      'A draft contains AI tells (em-dashes, "delve", parallel triplets, "It\'s important to note…")',
      'Long-form outputs that need a final pass before publication',
    ],
    howItWorks:
      '1. Reads the passage and infers register (formal, casual, technical, marketing).\n2. Removes hedging language, redundant qualifiers, and signpost phrases.\n3. Substitutes generic verbs with sharper alternatives.\n4. Preserves the original argument and any cited facts verbatim.',
    tips: 'Pair with `doc-coauthoring` for longer pieces. Pass `register: formal` for legal or board-facing content.',
    size: '3.2 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
  {
    id: 'internal-comms',
    name: 'Internal Comms',
    tone: '#d97706',
    icon: '◈',
    triggers: ['internal', 'announcement', 'all-hands', 'slack update', 'team update'],
    version: '1.1.3',
    addedAgo: '9 days ago',
    usedCount: 22,
    scope: 'All chats',
    compatible: ['Opus 4.7', 'Sonnet 4.6'],
    description: 'Draft clear, action-oriented internal announcements and updates.',
    whatItDoes:
      'Structures internal comms — all-hands updates, project announcements, policy changes — with the right tone and call-to-action.',
    whenInvoked: [
      'Requests for announcements, updates, or internal memos',
      'Mentions of "all-hands", "Slack", "team update", or "company-wide"',
      'Change management or org-update writing tasks',
    ],
    howItWorks:
      '1. Identifies audience and urgency.\n2. Selects the right template (announcement, update, ask).\n3. Returns structured copy with a clear CTA.',
    tips: 'Specify the audience (engineering / whole company / leadership) for better register calibration.',
    size: '2.6 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
  {
    id: 'mcp-builder',
    name: 'MCP Builder',
    tone: '#7c3aed',
    icon: '⚙',
    triggers: ['mcp', 'tool server', 'build mcp', 'mcp server', 'tool schema'],
    version: '0.9.2',
    addedAgo: '4 days ago',
    usedCount: 8,
    scope: 'All chats',
    compatible: ['Opus 4.7'],
    description: 'Scaffold and iterate on Model Context Protocol servers.',
    whatItDoes:
      'Generates MCP server stubs in TypeScript or Python, with tool schemas, request handlers, and a working stdio transport layer.',
    whenInvoked: [
      'User wants to create a new MCP server',
      'Requests mentioning "tool server", "MCP schema", or "stdio transport"',
      'Extending AGI with custom tools',
    ],
    howItWorks:
      '1. Clarifies the tool interface from your description.\n2. Generates a typed server stub.\n3. Returns runnable code with a test harness.',
    tips: 'Describe your tool in plain English — the skill handles the schema generation.',
    size: '6.2 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
  {
    id: 'slack-gif-creator',
    name: 'Slack GIF Creator',
    tone: '#db2777',
    icon: '◑',
    triggers: ['gif', 'slack gif', 'reaction gif', 'animated'],
    version: '1.0.0',
    addedAgo: '6 days ago',
    usedCount: 5,
    scope: 'All chats',
    compatible: ['Opus 4.7', 'Sonnet 4.6'],
    description: 'Generate or find the perfect GIF for any Slack moment.',
    whatItDoes:
      'Searches Tenor/GIPHY or generates a custom animated SVG for Slack reactions, celebration posts, and status updates.',
    whenInvoked: [
      'User asks for a reaction GIF or animation',
      'Slack-specific writing tasks that need a visual punch',
      'Celebration or milestone announcements',
    ],
    howItWorks:
      '1. Interprets the mood (celebrate, oops, thinking, done).\n2. Searches or generates the best visual match.\n3. Returns an embeddable link or SVG.',
    tips: 'Works best with the Slack connector enabled.',
    size: '1.8 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
  {
    id: 'theme-factory',
    name: 'Theme Factory',
    tone: '#0891b2',
    icon: '◐',
    triggers: ['theme', 'color scheme', 'design tokens', 'palette', 'dark mode'],
    version: '1.2.1',
    addedAgo: '8 days ago',
    usedCount: 14,
    scope: 'All chats',
    compatible: ['Opus 4.7', 'Sonnet 4.6'],
    description: 'Generate design-token sets and full color themes from a brief.',
    whatItDoes:
      'Produces complete design-token files (CSS custom properties, Tailwind config, or Figma-ready JSON) from a brief description or seed color.',
    whenInvoked: [
      'Requests for "a theme for…", "color palette", or "design tokens"',
      'Dark/light mode generation tasks',
      'Rebranding or theme iteration',
    ],
    howItWorks:
      '1. Extracts the brand intent (mood, industry, audience).\n2. Builds a harmonious palette with accessible contrast ratios.\n3. Exports in your preferred format.',
    tips: 'Pass `format: tailwind` or `format: css` to control output format.',
    size: '4.9 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
  {
    id: 'web-artifacts-builder',
    name: 'Web Artifacts Builder',
    tone: '#16a34a',
    icon: '⬡',
    triggers: ['web artifact', 'interactive', 'build a page', 'html app', 'live preview'],
    version: '2.0.0',
    addedAgo: '2 days ago',
    usedCount: 43,
    scope: 'All chats',
    compatible: ['Opus 4.7', 'Sonnet 4.6', 'GPT-5.1'],
    description: 'Build self-contained interactive web artifacts runnable in the preview pane.',
    whatItDoes:
      'Creates fully self-contained HTML/CSS/JS artifacts — charts, dashboards, games, tools — that run instantly in the artifact preview pane.',
    whenInvoked: [
      'Requests for interactive outputs (charts, calculators, demos)',
      'Phrases like "build a page", "make it interactive", "live preview"',
      'Data visualization or tool-building tasks',
    ],
    howItWorks:
      '1. Parses the functional spec.\n2. Selects libraries from the approved CDN list (Chart.js, D3, Lit).\n3. Returns a single-file artifact with zero external dependencies.',
    tips: 'Pair with `canvas-design` for polished layouts. Use `algorithmic-art` for purely visual outputs.',
    size: '7.1 KB · 1 file',
    license: 'MIT',
    author: '@agi-team',
  },
];

// ── SkillsView ────────────────────────────────────────────────────────────────

export function SkillsView() {
  const [activeId, setActiveId] = useState<string>('humanizer');
  const [search, setSearch] = useState('');

  const filtered = SKILLS.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  const skill = SKILLS.find((s) => s.id === activeId) ?? SKILLS[0]!;

  return (
    <div className="flex h-full overflow-hidden">
      {/* left pane — 220px */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--chat-border,#e8e3db)] overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-[var(--chat-border,#e8e3db)] px-3 py-2 text-xs text-[var(--chat-text-secondary,#6b6157)]">
          <Search size={11} className="shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills"
            className="flex-1 bg-transparent outline-none placeholder:text-[var(--chat-text-tertiary,#9e9488)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                activeId === s.id
                  ? 'bg-[var(--chat-bg-soft,#f5f0e8)]'
                  : 'hover:bg-[var(--chat-bg-soft,#f5f0e8)]',
              )}
            >
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm"
                style={{ background: s.tone + '22', color: s.tone }}
              >
                {s.icon}
              </div>
              <span className="truncate text-xs text-[var(--chat-text-primary,#1a1a1a)]">
                {s.name}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-[var(--chat-border,#e8e3db)] p-3">
          <button className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors">
            <Plus size={12} />
            Add skill
          </button>
        </div>
      </aside>

      {/* center pane — flexible */}
      <section className="flex-1 overflow-y-auto px-6 py-5">
        <div className="text-[10px] text-[var(--chat-text-tertiary,#9e9488)] mb-3 uppercase tracking-wider">
          Customize / Skills / {skill.id}
        </div>
        <h1 className="font-serif text-2xl font-medium text-[var(--chat-text-primary,#1a1a1a)] mb-1">
          {skill.name}
        </h1>
        <p className="text-sm text-[var(--chat-text-secondary,#6b6157)] mb-4 leading-relaxed">
          {skill.description}
        </p>

        {/* frontmatter */}
        <div className="rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] p-3 mb-5 font-mono text-xs">
          {[
            ['name', skill.name],
            ['description', skill.description],
            ['license', skill.license],
            ['size', skill.size],
            ['author', skill.author],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3 py-0.5">
              <span className="w-24 shrink-0 text-[var(--chat-text-tertiary,#9e9488)]">{k}</span>
              <span className="text-[var(--chat-text-primary,#1a1a1a)]">{v}</span>
            </div>
          ))}
        </div>

        {/* markdown content */}
        <div className="prose prose-sm max-w-none text-[var(--chat-text-primary,#1a1a1a)]">
          <h2 className="font-serif text-base font-medium mt-0 mb-2">What it does</h2>
          <p className="text-sm text-[var(--chat-text-secondary,#6b6157)] leading-relaxed mb-4">
            {skill.whatItDoes}
          </p>

          <h2 className="font-serif text-base font-medium mb-2">When AGI invokes this skill</h2>
          <ul className="mb-4 pl-4 space-y-1">
            {skill.whenInvoked.map((item, i) => (
              <li key={i} className="text-sm text-[var(--chat-text-secondary,#6b6157)]">
                {item}
              </li>
            ))}
          </ul>

          <h2 className="font-serif text-base font-medium mb-2">How it works</h2>
          <p className="text-sm text-[var(--chat-text-secondary,#6b6157)] leading-relaxed whitespace-pre-line mb-4">
            {skill.howItWorks}
          </p>

          <h2 className="font-serif text-base font-medium mb-2">Tips</h2>
          <p className="text-sm text-[var(--chat-text-secondary,#6b6157)] leading-relaxed">
            {skill.tips}
          </p>
        </div>
      </section>

      {/* right pane — 280px */}
      <aside className="w-[280px] shrink-0 border-l border-[var(--chat-border,#e8e3db)] overflow-y-auto px-4 py-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--chat-text-tertiary,#9e9488)] mb-2">
          Trigger keywords
        </h4>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {skill.triggers.map((t) => (
            <span
              key={t}
              className="rounded-full border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-2.5 py-1 text-[11px] text-[var(--chat-text-secondary,#6b6157)]"
            >
              {t}
            </span>
          ))}
        </div>

        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--chat-text-tertiary,#9e9488)] mb-2">
          Metadata
        </h4>
        <div className="mb-5 space-y-1.5">
          {[
            ['version', skill.version],
            ['added', skill.addedAgo],
            ['used', `${skill.usedCount} times`],
            ['scope', skill.scope],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-xs">
              <span className="text-[var(--chat-text-tertiary,#9e9488)]">{k}</span>
              <span className="text-[var(--chat-text-secondary,#6b6157)]">{v}</span>
            </div>
          ))}
        </div>

        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--chat-text-tertiary,#9e9488)] mb-2">
          Compatible with
        </h4>
        <div className="flex flex-wrap gap-1.5 mb-6">
          {skill.compatible.map((m) => (
            <span
              key={m}
              className="rounded-full border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-2.5 py-1 text-[11px] text-[var(--chat-text-secondary,#6b6157)]"
            >
              {m}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <button className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] px-3 py-2 text-xs text-[var(--chat-text-primary,#1a1a1a)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors">
            <Edit2 size={11} />
            Edit
          </button>
          <button className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] px-3 py-2 text-xs text-[var(--chat-text-primary,#1a1a1a)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors">
            <Code2 size={11} />
            View source
          </button>
          <button className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 hover:bg-red-100 transition-colors">
            <X size={11} />
            Disable skill
          </button>
        </div>
      </aside>
    </div>
  );
}
