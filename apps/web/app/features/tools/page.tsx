import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Globe,
  Terminal,
  FolderOpen,
  Eye,
  Monitor,
  Keyboard,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { EditorialPage } from '../../../components/marketing/editorial/EditorialPage';
import { DispatchSection } from '../../../components/marketing/editorial/DispatchSection';
import { MARKETING } from '../../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Desktop Tools & Computer Use | AGI Workforce',
  description:
    'Native desktop automation that sees your screen, controls your keyboard, manages your files, and runs terminal commands - all with safety controls. Browser automation, computer use, file management, and more.',
  keywords: [
    'desktop automation',
    'computer use',
    'browser automation',
    'screen capture',
    'terminal automation',
    'file management',
    'AI desktop agent',
    'keyboard automation',
    'Tauri desktop app',
    'AGI Workforce',
  ],
  alternates: {
    canonical: 'https://agiworkforce.com/features/tools',
  },
  openGraph: {
    title: 'Desktop Tools & Computer Use | AGI Workforce',
    description:
      'Native desktop automation that sees your screen, controls your keyboard, manages your files, and runs terminal commands - all with safety controls.',
    url: 'https://agiworkforce.com/features/tools',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce - Desktop Tools & Computer Use',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Desktop Tools & Computer Use | AGI Workforce',
    description:
      'Native desktop automation: browser control, terminal, file management, screen capture, computer use - with full safety controls.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Desktop Tools & Computer Use - AGI Workforce',
  description:
    'Native desktop automation that sees your screen, controls your keyboard, manages your files, and runs terminal commands - all with safety controls.',
  url: 'https://agiworkforce.com/features/tools',
  isPartOf: {
    '@type': 'WebSite',
    '@id': 'https://agiworkforce.com/#website',
    name: 'AGI Workforce',
    url: 'https://agiworkforce.com',
  },
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce Desktop',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Linux',
    featureList: [
      'Browser automation with Playwright',
      'Terminal and shell execution',
      'File system management',
      'Screen capture and OCR',
      'Full computer use (mouse and keyboard)',
      'Keyboard and input simulation',
      'ToolGuard safety validation',
      'Approval flows for sensitive operations',
    ],
  },
};

const webPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Tools - AGI Workforce',
  description: 'Unlimited MCP tools, screen automation, and desktop control for AI agents.',
  url: 'https://agiworkforce.com/features/tools',
  isPartOf: { '@type': 'WebSite', name: 'AGI Workforce', url: 'https://agiworkforce.com' },
};

const domains = [
  { icon: Globe, label: 'Browser', tools: 'navigate, click, extract, type, screenshot' },
  { icon: Terminal, label: 'Terminal', tools: 'execute, pipe, kill, read output' },
  { icon: FolderOpen, label: 'Files', tools: 'read, write, delete, list, search' },
  { icon: Eye, label: 'Vision', tools: 'screenshot, OCR, element detection' },
  { icon: Monitor, label: 'Computer Use', tools: 'observe-plan-act loop, mouse, keyboard' },
  { icon: Keyboard, label: 'Input', tools: 'type text, hotkeys, clipboard' },
];

const terminalLines = [
  { prompt: true, text: 'agent task "Find flights under $400 to Tokyo for March"' },
  { prompt: false, text: '' },
  { prompt: false, text: 'ToolGuard  tier=Confirmation  tool=browser_navigate' },
  { prompt: false, text: '           url=https://google.com/travel/flights' },
  { prompt: false, text: '           rate=20/min  risk=High  approved=true', accent: true },
  { prompt: false, text: '' },
  {
    prompt: false,
    text: 'invoke     browser_navigate  { url: "https://google.com/travel/flights" }',
  },
  { prompt: false, text: '           status=ok  latency=340ms' },
  {
    prompt: false,
    text: 'invoke     browser_type      { selector: "[aria-label=\\"Where to?\\"]", text: "Tokyo" }',
  },
  { prompt: false, text: 'invoke     browser_click     { selector: "[data-result=\\"NRT\\"]" }' },
  {
    prompt: false,
    text: 'invoke     browser_extract   { selector: ".result-price", extract_type: "text" }',
  },
  { prompt: false, text: '           results=14  filtered=3 under $400' },
  { prompt: false, text: '' },
  { prompt: false, text: 'ToolGuard  tier=Safe          tool=file_write' },
  { prompt: false, text: 'invoke     file_write        { path: "~/Desktop/tokyo-flights.csv" }' },
  { prompt: false, text: '           wrote 3 rows, 847 bytes', accent: true },
];

const safetyTiers = [
  {
    name: 'Safe',
    rate: '30/min',
    description: 'Runs automatically. Read-only operations with no side effects.',
    examples: 'file_read, file_list, browser_get_text, ui_screenshot',
    risk: 'Low',
  },
  {
    name: 'Notification',
    rate: '30/min',
    description: 'Executes and notifies you. Medium-risk reads that access external data.',
    examples: 'browser_extract, search_web, browser_screenshot',
    risk: 'Medium',
  },
  {
    name: 'Confirmation',
    rate: '5-20/min',
    description:
      'Pauses for your approval. Operations that modify state or access sensitive resources.',
    examples: 'file_write, file_delete, browser_navigate, terminal_execute',
    risk: 'High',
  },
  {
    name: 'Explicit Approval',
    rate: '5/min',
    description:
      'Requires detailed review. Arbitrary code execution and irreversible system changes.',
    examples: 'code_execute',
    risk: 'Critical',
  },
];

const capabilities = [
  {
    icon: Globe,
    title: 'Browser Automation',
    description:
      'Playwright-powered DOM operations. Navigate, click, type, extract, screenshot any website without an API.',
    tools: [
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_extract',
      'browser_screenshot',
    ],
  },
  {
    icon: Terminal,
    title: 'Terminal & Shell',
    description:
      'Full shell access with command injection detection and sandboxing. Execute, pipe, manage processes.',
    tools: ['terminal_execute', 'terminal_pipe', 'terminal_kill'],
  },
  {
    icon: FolderOpen,
    title: 'File Management',
    description:
      'Read, write, search, delete with path traversal protection. Bulk operations with undo support via ToolGuard.',
    tools: ['file_read', 'file_write', 'file_delete', 'file_list', 'file_search'],
  },
  {
    icon: Eye,
    title: 'Screen Capture & Vision',
    description:
      'Screenshot any region, OCR text extraction, visual element detection. The AI sees what you see.',
    tools: ['ui_screenshot', 'screen_ocr', 'element_detect'],
  },
  {
    icon: Monitor,
    title: 'Computer Use',
    description:
      'Observe-Plan-Act loop for autonomous desktop control. Mouse positioning, clicking, dragging across applications.',
    tools: ['ui_click', 'ui_type', 'mouse_move', 'mouse_drag'],
  },
  {
    icon: Keyboard,
    title: 'Keyboard & Input',
    description:
      'Type text, execute hotkeys, manage clipboard. Automate any repetitive input across any application.',
    tools: ['keyboard_type', 'keyboard_hotkey', 'clipboard_read', 'clipboard_write'],
  },
];

export default function ToolsFeaturePage() {
  return (
    <EditorialPage tier="paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
        <div className="flex-1 pt-24">
          {/* Hero */}
          <section className="relative py-20 md:py-28 lg:py-36">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-3xl">
                <p className="mb-6 font-mono text-sm tracking-wider text-[#c8892a]">
                  {MARKETING.tools.display} native IPC tools
                </p>
                <h1 className="text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
                  Your desktop,
                  <br />
                  fully autonomous
                </h1>
                <p className="mt-6 max-w-xl text-lg text-[#888480]">
                  Sees your screen, controls your keyboard, manages your files, and runs terminal
                  commands - all validated through a 4-tier safety model before execution.
                </p>

                {/* 6 domain pills */}
                <div className="mt-10 flex flex-wrap gap-3">
                  {domains.map((d) => (
                    <div
                      key={d.label}
                      className="flex items-center gap-2.5 rounded-full border border-[#222220] bg-[#111110] px-4 py-2"
                    >
                      <d.icon className="h-4 w-4 text-[#c8892a]" />
                      <div>
                        <span className="text-sm font-medium text-[#edebe8]">{d.label}</span>
                        <span className="ml-2 text-sm text-[#555150]">{d.tools}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-10 flex gap-4">
                  <Link
                    href="/download"
                    className="inline-flex h-11 items-center rounded-lg bg-[#c8892a] px-6 text-sm font-medium text-[#09090b] transition-colors hover:bg-[#d49a3a]"
                  >
                    Download
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                  <Link
                    href="#safety"
                    className="inline-flex h-11 items-center rounded-lg border border-[#222220] px-6 text-sm font-medium text-[#888480] transition-colors hover:border-[#333330] hover:text-[#edebe8]"
                  >
                    Safety model
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Terminal mockup */}
          <section className="border-y border-[#1a1a18] bg-black py-20 md:py-28">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-3xl">
                <h2 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
                  What a tool execution looks like
                </h2>
                <p className="mb-10 text-[#888480]">
                  Every IPC call is logged, rate-limited, and validated by ToolGuard before it
                  reaches your system.
                </p>

                <div className="overflow-hidden rounded-lg border border-[#222220]">
                  {/* Title bar */}
                  <div className="flex items-center gap-2 border-b border-[#222220] bg-[#111110] px-4 py-2.5">
                    <div className="h-3 w-3 rounded-full bg-[#333330]" />
                    <div className="h-3 w-3 rounded-full bg-[#333330]" />
                    <div className="h-3 w-3 rounded-full bg-[#333330]" />
                    <span className="ml-3 font-mono text-xs text-[#555150]">
                      agiworkforce - tool execution log
                    </span>
                  </div>

                  {/* Terminal body */}
                  <div className="overflow-x-auto bg-[#0a0a09] p-5 font-mono text-[13px] leading-6">
                    {terminalLines.map((line, i) => (
                      <div key={i} className="whitespace-pre">
                        {line.prompt ? (
                          <span>
                            <span className="text-[#c8892a]">$ </span>
                            <span className="text-[#edebe8]">{line.text}</span>
                          </span>
                        ) : line.text === '' ? (
                          '\u00A0'
                        ) : (
                          <span className={line.accent ? 'text-[#c8892a]' : 'text-[#666660]'}>
                            {line.text}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Safety tiers */}
          <section id="safety" className="bg-[#09090b] py-20 md:py-28">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-[#c8892a]" />
                  <span className="font-mono text-sm text-[#c8892a]">ToolGuard</span>
                </div>
                <h2 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">
                  4-tier safety model
                </h2>
                <p className="mb-12 max-w-xl text-[#888480]">
                  Every tool call is classified by risk level and routed through the appropriate
                  approval tier. Low-risk reads execute instantly. Destructive operations wait for
                  you.
                </p>

                {/* Horizontal tier progression */}
                <div className="grid gap-px overflow-hidden rounded-lg border border-[#222220] bg-[#222220] md:grid-cols-4">
                  {safetyTiers.map((tier, i) => (
                    <div key={tier.name} className="relative bg-[#0e0e0c] p-5">
                      {/* Tier number */}
                      <div className="mb-4 flex items-center gap-3">
                        <span className="font-mono text-xs text-[#555150]">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-sm font-semibold text-[#edebe8]">{tier.name}</span>
                      </div>

                      {/* Rate */}
                      <div className="mb-3 font-mono text-xs text-[#c8892a]">{tier.rate}</div>

                      {/* Description */}
                      <p className="mb-4 text-sm leading-relaxed text-[#888480]">
                        {tier.description}
                      </p>

                      {/* Example tools */}
                      <div className="font-mono text-xs leading-5 text-[#555150]">
                        {tier.examples.split(', ').map((tool) => (
                          <div key={tool}>{tool}</div>
                        ))}
                      </div>

                      {/* Arrow connector (hidden on last) */}
                      {i < safetyTiers.length - 1 && (
                        <ChevronRight className="absolute right-0 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 translate-x-1/2 text-[#555150] md:block" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Mapping legend */}
                <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-[#555150]">
                  <span>Low risk = Safe</span>
                  <span>Medium risk (no approval) = Notification</span>
                  <span>Medium/High risk = Confirmation</span>
                  <span>Critical risk = Explicit Approval</span>
                </div>
              </div>
            </div>
          </section>

          {/* Capabilities */}
          <section className="border-t border-[#1a1a18] bg-black py-20 md:py-28">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-4xl">
                <h2 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">
                  6 automation domains
                </h2>
                <p className="mb-12 text-[#888480]">
                  Each domain exposes IPC tools the AI agent can call. All validated by ToolGuard.
                </p>

                <div className="grid gap-px overflow-hidden rounded-lg border border-[#222220] bg-[#222220] md:grid-cols-2">
                  {capabilities.map((cap) => (
                    <div key={cap.title} className="bg-[#0e0e0c] p-6">
                      <div className="mb-3 flex items-center gap-3">
                        <cap.icon className="h-5 w-5 text-[#888480]" />
                        <h3 className="text-base font-semibold">{cap.title}</h3>
                      </div>
                      <p className="mb-4 text-sm leading-relaxed text-[#888480]">
                        {cap.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {cap.tools.map((tool) => (
                          <span
                            key={tool}
                            className="rounded border border-[#222220] bg-[#111110] px-2 py-0.5 font-mono text-xs text-[#555150]"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <DispatchSection slugIndex="04" slugKicker="DISPATCH" />
        </div>
      </div>
    </EditorialPage>
  );
}
