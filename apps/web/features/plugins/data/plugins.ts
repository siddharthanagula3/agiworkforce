import type { Plugin } from '../types';

/**
 * Demo-ready plugin catalogue used by the marketplace and detail pages.
 * Keep connector IDs aligned with features/connectors/data/connectors.ts.
 */
export const PLUGIN_CATALOG: Plugin[] = [
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
