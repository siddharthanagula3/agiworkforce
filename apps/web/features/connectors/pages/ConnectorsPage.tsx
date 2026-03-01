'use client';

import React, { useState, useMemo } from 'react';
import { Search, Plus, Check, MoreHorizontal, Zap, Lock, ExternalLink } from 'lucide-react';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Badge } from '@shared/ui/badge';
import { cn } from '@shared/lib/utils';

// ─── Connector Data ────────────────────────────────────────────────────────────

type ConnectorCategory = 'Productivity' | 'Developer' | 'CRM' | 'Marketing' | 'Finance' | 'Social' | 'AI' | 'Exclusive';
type AuthType = 'oauth' | 'api_key' | 'connection_string' | 'pat';
type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface Connector {
  id: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  authType: AuthType;
  actionCount: number;
  phase: Phase;
  iconBg: string;
  iconText: string;
  iconEmoji?: string;
  exclusive?: boolean;
}

const CONNECTORS: Connector[] = [
  // Phase 1 — Core Productivity
  {
    id: 'gmail',
    name: 'Gmail & Calendar',
    description: 'Search, send emails, create calendar events, and manage your Google Workspace.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 8,
    phase: 1,
    iconBg: 'from-red-500 to-red-600',
    iconText: 'G',
    iconEmoji: '📧',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Read, write, search, and upload files across your entire Google Drive.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 6,
    phase: 1,
    iconBg: 'from-yellow-500 to-green-500',
    iconText: '▲',
    iconEmoji: '📁',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search pages, create and update content, manage databases and workspaces.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 7,
    phase: 1,
    iconBg: 'from-gray-800 to-gray-900',
    iconText: 'N',
    iconEmoji: '📝',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Post messages, search conversations, read channels, and manage workspaces.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 5,
    phase: 1,
    iconBg: 'from-purple-500 to-purple-700',
    iconText: 'S',
    iconEmoji: '💬',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Search repos, create PRs, manage issues, push code, and review changes.',
    category: 'Developer',
    authType: 'oauth',
    actionCount: 10,
    phase: 1,
    iconBg: 'from-gray-700 to-gray-900',
    iconText: 'GH',
    iconEmoji: '🐙',
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Read and write cells, create spreadsheets, and run formulas programmatically.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 5,
    phase: 1,
    iconBg: 'from-green-500 to-green-700',
    iconText: '▦',
    iconEmoji: '📊',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Search email, manage calendar events, and send messages via Microsoft.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 6,
    phase: 1,
    iconBg: 'from-blue-500 to-blue-700',
    iconText: 'O',
    iconEmoji: '📮',
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description: 'Read, write, and search files in your Microsoft OneDrive storage.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 5,
    phase: 1,
    iconBg: 'from-sky-400 to-blue-600',
    iconText: '☁',
    iconEmoji: '☁️',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Create and manage issues, projects, cycles, and engineering workflows.',
    category: 'Developer',
    authType: 'oauth',
    actionCount: 8,
    phase: 1,
    iconBg: 'from-violet-500 to-indigo-600',
    iconText: 'L',
    iconEmoji: '⚡',
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Create and manage issues, sprints, epics, and project boards.',
    category: 'Developer',
    authType: 'oauth',
    actionCount: 8,
    phase: 1,
    iconBg: 'from-blue-500 to-indigo-600',
    iconText: 'J',
    iconEmoji: '🎯',
  },

  // Phase 2 — Collaboration
  {
    id: 'teams',
    name: 'Microsoft Teams',
    description: 'Send messages, manage channels, and search conversations in Teams.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 5,
    phase: 2,
    iconBg: 'from-indigo-500 to-purple-600',
    iconText: 'T',
    iconEmoji: '👥',
  },
  {
    id: 'confluence',
    name: 'Confluence',
    description: 'Search and create pages, manage spaces and knowledge bases.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 6,
    phase: 2,
    iconBg: 'from-blue-600 to-indigo-700',
    iconText: 'C',
    iconEmoji: '📚',
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Create and manage tasks, projects, and team workflows.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 7,
    phase: 2,
    iconBg: 'from-pink-500 to-red-500',
    iconText: 'A',
    iconEmoji: '✅',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Schedule meetings, retrieve recordings, and manage participants.',
    category: 'Productivity',
    authType: 'oauth',
    actionCount: 4,
    phase: 2,
    iconBg: 'from-blue-500 to-blue-600',
    iconText: 'Z',
    iconEmoji: '📹',
  },

  // Phase 3 — CRM
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Manage contacts, companies, deals, and notes in your CRM.',
    category: 'CRM',
    authType: 'oauth',
    actionCount: 9,
    phase: 3,
    iconBg: 'from-orange-500 to-orange-600',
    iconText: 'H',
    iconEmoji: '🎯',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'CRUD on CRM objects, manage leads, opportunities, and accounts.',
    category: 'CRM',
    authType: 'oauth',
    actionCount: 10,
    phase: 3,
    iconBg: 'from-cyan-500 to-blue-600',
    iconText: 'SF',
    iconEmoji: '☁️',
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description: 'Schedule meetings, manage event types, and track bookings.',
    category: 'CRM',
    authType: 'oauth',
    actionCount: 4,
    phase: 3,
    iconBg: 'from-teal-500 to-cyan-600',
    iconText: 'CL',
    iconEmoji: '📅',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    description: 'Manage conversations, customers, tickets, and support workflows.',
    category: 'CRM',
    authType: 'oauth',
    actionCount: 6,
    phase: 3,
    iconBg: 'from-blue-600 to-indigo-700',
    iconText: 'IC',
    iconEmoji: '💬',
  },

  // Phase 5 — Marketing
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    description: 'Query reports, audience data, conversions, and traffic sources.',
    category: 'Marketing',
    authType: 'oauth',
    actionCount: 6,
    phase: 5,
    iconBg: 'from-orange-500 to-amber-600',
    iconText: 'GA',
    iconEmoji: '📈',
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    description: 'Manage audiences, campaigns, email templates, and analytics.',
    category: 'Marketing',
    authType: 'oauth',
    actionCount: 7,
    phase: 5,
    iconBg: 'from-yellow-500 to-amber-600',
    iconText: 'MC',
    iconEmoji: '🐒',
  },

  // Phase 6 — Finance
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Manage payments, subscriptions, customers, and financial reports.',
    category: 'Finance',
    authType: 'api_key',
    actionCount: 8,
    phase: 6,
    iconBg: 'from-violet-500 to-indigo-600',
    iconText: 'S',
    iconEmoji: '💳',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Manage products, orders, customers, and inventory in your store.',
    category: 'Finance',
    authType: 'oauth',
    actionCount: 9,
    phase: 6,
    iconBg: 'from-green-500 to-emerald-600',
    iconText: 'SH',
    iconEmoji: '🛍️',
  },

  // Phase 7 — Social
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Post content, manage your profile, and engage with your network.',
    category: 'Social',
    authType: 'oauth',
    actionCount: 5,
    phase: 7,
    iconBg: 'from-blue-600 to-blue-800',
    iconText: 'in',
    iconEmoji: '💼',
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    description: 'Post tweets, search content, and manage your X account.',
    category: 'Social',
    authType: 'oauth',
    actionCount: 5,
    phase: 7,
    iconBg: 'from-gray-800 to-black',
    iconText: 'X',
    iconEmoji: '🐦',
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Post messages, manage servers, channels, and community.',
    category: 'Social',
    authType: 'oauth',
    actionCount: 5,
    phase: 7,
    iconBg: 'from-indigo-500 to-violet-600',
    iconText: 'DC',
    iconEmoji: '🎮',
  },

  // Phase 8 — AI
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Run completions, manage assistants, and work with GPT models.',
    category: 'AI',
    authType: 'api_key',
    actionCount: 6,
    phase: 8,
    iconBg: 'from-emerald-500 to-teal-600',
    iconText: 'AI',
    iconEmoji: '🤖',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Generate speech, clone voices, and create audio content.',
    category: 'AI',
    authType: 'api_key',
    actionCount: 5,
    phase: 8,
    iconBg: 'from-violet-500 to-purple-700',
    iconText: '11',
    iconEmoji: '🎙️',
  },

  // AGI Workforce Exclusive
  {
    id: 'local-filesystem',
    name: 'Local Filesystem',
    description: 'Read and write any file on your computer. No cloud required.',
    category: 'Exclusive',
    authType: 'pat',
    actionCount: 8,
    phase: 1,
    iconBg: 'from-amber-500 to-orange-600',
    iconText: 'FS',
    iconEmoji: '💾',
    exclusive: true,
  },
  {
    id: 'terminal',
    name: 'Terminal / Shell',
    description: 'Execute commands, run scripts, manage processes, and automate tasks.',
    category: 'Exclusive',
    authType: 'pat',
    actionCount: 6,
    phase: 1,
    iconBg: 'from-gray-700 to-gray-900',
    iconText: '>_',
    iconEmoji: '⚡',
    exclusive: true,
  },
  {
    id: 'browser-automation',
    name: 'Browser Automation',
    description: 'Control Chrome, Firefox, and Safari via CDP. Fill forms, scrape, navigate.',
    category: 'Exclusive',
    authType: 'pat',
    actionCount: 10,
    phase: 1,
    iconBg: 'from-blue-500 to-cyan-600',
    iconText: '◎',
    iconEmoji: '🌐',
    exclusive: true,
  },
  {
    id: 'screen-vision',
    name: 'Screen Vision',
    description: 'OCR, screenshots, and computer use — AI sees and controls your screen.',
    category: 'Exclusive',
    authType: 'pat',
    actionCount: 7,
    phase: 1,
    iconBg: 'from-pink-500 to-rose-600',
    iconText: '👁',
    iconEmoji: '👁️',
    exclusive: true,
  },
  {
    id: 'ollama',
    name: 'Local LLMs (Ollama)',
    description: 'Route tasks to local models — Llama, Mistral, Qwen, and more. Zero cloud cost.',
    category: 'Exclusive',
    authType: 'pat',
    actionCount: 4,
    phase: 1,
    iconBg: 'from-teal-500 to-emerald-600',
    iconText: '🦙',
    iconEmoji: '🦙',
    exclusive: true,
  },
];

const CATEGORIES: { label: string; value: ConnectorCategory | 'All' }[] = [
  { label: 'All', value: 'All' },
  { label: 'Productivity', value: 'Productivity' },
  { label: 'Developer', value: 'Developer' },
  { label: 'CRM', value: 'CRM' },
  { label: 'Marketing', value: 'Marketing' },
  { label: 'Finance', value: 'Finance' },
  { label: 'Social', value: 'Social' },
  { label: 'AI', value: 'AI' },
  { label: '⭐ AGI Exclusive', value: 'Exclusive' },
];

// ─── ConnectorCard ─────────────────────────────────────────────────────────────

interface ConnectorCardProps {
  connector: Connector;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

const ConnectorCard: React.FC<ConnectorCardProps> = ({
  connector,
  connected,
  onConnect,
  onDisconnect,
}) => {
  const isComingSoon = connector.phase > 1;

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card p-5 transition-all duration-200',
        connected
          ? 'border-primary/30 bg-primary/5'
          : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]',
        connector.exclusive && 'border-amber-500/20 bg-amber-500/5 hover:border-amber-500/30',
      )}
    >
      {/* Exclusive badge */}
      {connector.exclusive && (
        <div className="absolute right-3 top-3">
          <Badge className="border-0 bg-amber-500/20 px-1.5 py-0 text-[10px] font-semibold text-amber-400">
            EXCLUSIVE
          </Badge>
        </div>
      )}

      {/* Coming Soon overlay */}
      {isComingSoon && (
        <div className="absolute right-3 top-3">
          <Badge variant="outline" className="border-white/10 px-1.5 py-0 text-[10px] text-muted-foreground">
            Phase {connector.phase}
          </Badge>
        </div>
      )}

      {/* Icon + Name */}
      <div className="mb-3 flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-lg',
            connector.iconBg,
          )}
        >
          {connector.iconEmoji ?? connector.iconText}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{connector.name}</h3>
          <p className="text-xs text-muted-foreground">{connector.actionCount} actions</p>
        </div>
      </div>

      {/* Description */}
      <p className="mb-4 flex-1 text-xs leading-relaxed text-muted-foreground/80">
        {connector.description}
      </p>

      {/* Action Row */}
      <div className="flex items-center justify-between">
        {connected ? (
          <>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">Connected</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={onDisconnect}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        ) : isComingSoon && !connector.exclusive ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full cursor-not-allowed text-xs text-muted-foreground opacity-50"
            disabled
          >
            <Lock className="mr-1.5 h-3 w-3" />
            Coming Soon
          </Button>
        ) : (
          <Button
            size="sm"
            className={cn(
              'h-7 w-full text-xs',
              connector.exclusive
                ? 'bg-amber-500 text-black hover:bg-amber-400'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
            onClick={onConnect}
          >
            {connector.exclusive ? (
              <>
                <Zap className="mr-1.5 h-3 w-3" />
                Enable
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-3 w-3" />
                Connect
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

// ─── ConnectorsPage ────────────────────────────────────────────────────────────

export function ConnectorsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory | 'All'>('All');
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set(['local-filesystem', 'terminal', 'screen-vision']));

  const filteredConnectors = useMemo(() => {
    return CONNECTORS.filter((c) => {
      const matchesCategory = activeCategory === 'All' || c.category === activeCategory;
      const matchesSearch =
        !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, activeCategory]);

  const connectedConnectors = filteredConnectors.filter((c) => connectedIds.has(c.id));
  const availableConnectors = filteredConnectors.filter((c) => !connectedIds.has(c.id));

  const handleConnect = (id: string) => {
    // In production: open OAuth flow or API key dialog
    setConnectedIds((prev) => new Set([...prev, id]));
  };

  const handleDisconnect = (id: string) => {
    setConnectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="min-h-full bg-background">
      {/* Page Header */}
      <div className="border-b border-white/[0.06] bg-black/20 px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Connectors</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect your tools and give your AI agents access to the apps you use every day.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-white/10 text-xs text-muted-foreground">
                {connectedIds.size} connected
              </Badge>
              <Badge variant="outline" className="border-white/10 text-xs text-muted-foreground">
                {CONNECTORS.length} total
              </Badge>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-5 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search connectors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 border-white/[0.08] bg-white/[0.04] pl-9 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50"
            />
          </div>

          {/* Category Tabs */}
          <div className="scrollbar-hide mt-4 flex gap-1 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setActiveCategory(cat.value)}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150',
                  activeCategory === cat.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Connected Section */}
        {connectedConnectors.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-foreground">
                Connected ({connectedConnectors.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {connectedConnectors.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  connected={true}
                  onConnect={() => handleConnect(connector.id)}
                  onDisconnect={() => handleDisconnect(connector.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Available Section */}
        {availableConnectors.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Available
                {activeCategory === 'All' || activeCategory === 'Exclusive' ? '' : ` — ${activeCategory}`}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  ({availableConnectors.length})
                </span>
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {availableConnectors.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  connected={false}
                  onConnect={() => handleConnect(connector.id)}
                  onDisconnect={() => handleDisconnect(connector.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {filteredConnectors.length === 0 && (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
              <Search className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground">No connectors found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search term or category.
            </p>
          </div>
        )}

        {/* Roadmap Callout */}
        {(activeCategory === 'All' || activeCategory !== 'Exclusive') && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">105+ Connectors Planned</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  We&apos;re rolling out connectors in phases — from core productivity tools to AI models,
                  marketing platforms, and enterprise apps. Phase 1 (10 core connectors) ships first,
                  followed by CRM, marketing, finance, and social in subsequent phases.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['Airtable', 'Trello', 'ClickUp', 'Pipedrive', 'Twilio', 'SendGrid', 'Ahrefs', 'QuickBooks', 'Dropbox', 'Figma'].map((name) => (
                    <Badge
                      key={name}
                      variant="outline"
                      className="border-white/[0.08] px-2 py-0 text-[10px] text-muted-foreground"
                    >
                      {name}
                    </Badge>
                  ))}
                  <Badge
                    variant="outline"
                    className="border-white/[0.08] px-2 py-0 text-[10px] text-muted-foreground"
                  >
                    +95 more
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
