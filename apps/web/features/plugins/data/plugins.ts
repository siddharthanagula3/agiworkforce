import type { Plugin } from '../types';

/**
 * Offline mirror of the hosted plugin registry seed.
 *
 * The hosted catalogue is `public.plugin_registry_entries`
 * (db/neon/0096_plugin_registry.sql), served by `/api/plugins`. The /plugins
 * pages read it live via `features/plugins/server/registry-source.ts` and NO
 * LONGER import this file.
 *
 * It survives for one caller that cannot do an async read where it renders —
 * the settings modal's plugin list (`features/settings/components/WebSettingsModal.tsx`,
 * a client component that builds its catalogue at module scope). Keeping a
 * second hardcoded list is a real drift risk, so `plugins.registry-parity.test.ts`
 * asserts every id/name/version/description here still matches the 0096 seed
 * and fails the build when they diverge.
 *
 * Every entry is a DECLARED pack: nothing here is installable, which is why
 * there is no `downloadCount`, no rating, and no availability badge.
 * Connector ids stay aligned with features/connectors/data/connectors.ts.
 */
export const PLUGIN_CATALOG: Plugin[] = [
  {
    id: 'calendar-assistant',
    name: 'Calendar Assistant',
    author: 'AGI',
    version: '1.2.0',
    description:
      'Smart scheduling, meeting preparation summaries, and follow-up action item extraction from your calendar events.',
    category: 'Productivity',
    source: 'builtin',
    skills: ['Meeting Summarizer', 'Action Item Extractor', 'Scheduler'],
    connectors: ['gmail', 'google-calendar'],
  },
  {
    id: 'github-automation',
    name: 'GitHub Automation',
    author: 'AGI',
    version: '1.0.0',
    description:
      'Automate pull request reviews, issue triage, and CI/CD status checks directly from your chat interface.',
    category: 'Developer',
    source: 'builtin',
    skills: ['Code Review', 'Issue Summarizer', 'PR Drafter'],
    connectors: ['github'],
  },
  {
    id: 'research-pack',
    name: 'Research Pack',
    author: 'AGI',
    version: '0.9.1',
    description:
      'Deep web research with source citation, structured literature review, and fact-check verification against live sources.',
    category: 'Research',
    source: 'marketplace',
    skills: ['Web Researcher', 'Citation Formatter', 'Fact Checker'],
    connectors: [],
  },
  {
    id: 'crm-sync',
    name: 'CRM Sync',
    author: 'AGI',
    version: '1.1.0',
    description:
      'Summarize sales calls, auto-update CRM records, draft follow-up emails, and surface deal insights.',
    category: 'Sales',
    source: 'marketplace',
    skills: ['Call Summarizer', 'Email Drafter', 'Deal Analyzer'],
    connectors: ['salesforce', 'hubspot', 'gmail'],
  },
];
