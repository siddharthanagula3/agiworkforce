import type { Plugin } from '../types';

/**
 * Example plugin catalogue.
 * Used by the Plugin Marketplace page and the plugin detail page for previews.
 * Real plugins will be served from the API; this data is preview-only.
 */
export const EXAMPLE_PLUGINS: Plugin[] = [
  {
    id: 'github-automation',
    name: 'GitHub Automation',
    author: 'AGI Workforce',
    version: '1.0.0',
    description:
      'Automate pull request reviews, issue triage, and CI/CD status checks directly from your chat interface.',
    category: 'Developer',
    source: 'builtin',
    downloadCount: 4820,
    skills: ['Code Review', 'Issue Summarizer', 'PR Drafter'],
    connectors: ['github'],
  },
  {
    id: 'calendar-assistant',
    name: 'Calendar Assistant',
    author: 'AGI Workforce',
    version: '1.2.0',
    description:
      'Smart scheduling, meeting preparation summaries, and follow-up action item extraction from your calendar events.',
    category: 'Productivity',
    source: 'builtin',
    downloadCount: 7310,
    skills: ['Meeting Summarizer', 'Action Item Extractor', 'Scheduler'],
    connectors: ['gmail'],
  },
  {
    id: 'research-pack',
    name: 'Research Pack',
    author: 'AGI Workforce',
    version: '0.9.1',
    description:
      'Deep web research with source citation, structured literature review, and fact-check verification against live sources.',
    category: 'Research',
    source: 'marketplace',
    downloadCount: 3150,
    skills: ['Web Researcher', 'Citation Formatter', 'Fact Checker'],
    connectors: [],
  },
  {
    id: 'crm-sync',
    name: 'CRM Sync',
    author: 'AGI Workforce',
    version: '1.1.0',
    description:
      'Summarize sales calls, auto-update CRM records, draft follow-up emails, and surface deal insights.',
    category: 'Sales',
    source: 'marketplace',
    downloadCount: 2670,
    skills: ['Call Summarizer', 'Email Drafter', 'Deal Analyzer'],
    connectors: ['salesforce', 'hubspot', 'gmail'],
  },
];
