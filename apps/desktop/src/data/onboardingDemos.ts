/**
 * Onboarding Demo Definitions
 * Pre-configured demos for each user role
 */

import type { OnboardingDemo, RoleOption, UserRole } from '../types/onboarding';

// Role definitions with descriptions
export const ROLE_OPTIONS: RoleOption[] = [
  {
    id: 'founder',
    title: 'Founder / CEO',
    icon: '👨‍💼',
    description: 'Running a business with limited time and resources',
    perfectFor: 'Business owners who need to maximize productivity',
    recommendedEmployees: ['Inbox Manager', 'Meeting Scheduler', 'Report Generator'],
  },
  {
    id: 'developer',
    title: 'Developer / Engineer',
    icon: '👨‍💻',
    description: 'Building software and automating workflows',
    perfectFor: 'Engineers who want to automate repetitive coding tasks',
    recommendedEmployees: ['Code Reviewer', 'Documentation Writer', 'Test Generator'],
  },
  {
    id: 'operations',
    title: 'Operations Manager',
    icon: '📊',
    description: 'Managing processes and optimizing efficiency',
    perfectFor: 'Operations professionals streamlining business processes',
    recommendedEmployees: ['Data Processor', 'Report Consolidator', 'Task Tracker'],
  },
  {
    id: 'sales_marketing',
    title: 'Sales / Marketing',
    icon: '💼',
    description: 'Driving revenue and customer engagement',
    perfectFor: 'Sales and marketing teams scaling outreach',
    recommendedEmployees: ['Lead Enricher', 'Email Campaigner', 'Content Creator'],
  },
  {
    id: 'designer',
    title: 'Designer / Creator',
    icon: '🎨',
    description: 'Creating visual content and managing design assets',
    perfectFor: 'Creatives automating design workflows and asset management',
    recommendedEmployees: ['Asset Organizer', 'Image Processor', 'Brand Guardian'],
  },
  {
    id: 'personal',
    title: 'Personal Use',
    icon: '👤',
    description: 'Automating personal tasks and productivity',
    perfectFor: 'Individuals wanting to save time on daily tasks',
    recommendedEmployees: ['File Organizer', 'Email Assistant', 'Research Helper'],
  },
];

// Demo definitions for each role
export const ONBOARDING_DEMOS: Record<UserRole, OnboardingDemo[]> = {
  founder: [
    {
      id: 'inbox-zero',
      title: 'Inbox Zero in 30 Seconds',
      description: 'Automatically categorize 50 emails, flag urgent items, and draft 12 responses',
      roleId: 'founder',
      estimatedTimeSeconds: 35,
      valueSavedMinutes: 150,
      valueSavedUsd: 75.0,
      employeeId: 'inbox_manager',
      employeeName: 'Inbox Manager',
      isPopular: true,
      steps: [
        {
          id: 'scan',
          action: 'Scanning inbox',
          description: 'Reading 50 unread emails',
          durationMs: 3000,
        },
        {
          id: 'categorize',
          action: 'Categorizing',
          description: 'Sorting by priority and topic',
          durationMs: 4000,
        },
        {
          id: 'urgent',
          action: 'Flagging urgent',
          description: 'Identified 5 urgent items requiring attention',
          durationMs: 2000,
        },
        {
          id: 'draft',
          action: 'Drafting responses',
          description: 'Writing 12 draft replies',
          durationMs: 8000,
        },
        {
          id: 'summarize',
          action: 'Creating summary',
          description: 'Generated executive summary of key emails',
          durationMs: 3000,
        },
      ],
    },
    {
      id: 'meeting-scheduler',
      title: 'Auto-Schedule Team Meetings',
      description: 'Find optimal meeting times for 8 team members across 3 timezones',
      roleId: 'founder',
      estimatedTimeSeconds: 25,
      valueSavedMinutes: 45,
      valueSavedUsd: 22.5,
      employeeId: 'meeting_scheduler',
      employeeName: 'Meeting Scheduler',
      steps: [
        {
          id: 'availability',
          action: 'Checking availability',
          description: 'Scanning 8 calendars for open slots',
          durationMs: 4000,
        },
        {
          id: 'timezone',
          action: 'Optimizing timezones',
          description: 'Finding times that work across US, EU, Asia',
          durationMs: 3000,
        },
        {
          id: 'schedule',
          action: 'Scheduling meetings',
          description: 'Booked 3 meetings with optimal attendance',
          durationMs: 5000,
        },
        {
          id: 'invites',
          action: 'Sending invites',
          description: 'Created calendar invites with agendas',
          durationMs: 3000,
        },
      ],
    },
    {
      id: 'report-generator',
      title: 'Weekly Executive Report',
      description: 'Compile metrics from 5 sources into a formatted executive summary',
      roleId: 'founder',
      estimatedTimeSeconds: 30,
      valueSavedMinutes: 120,
      valueSavedUsd: 60.0,
      employeeId: 'report_generator',
      employeeName: 'Report Generator',
      steps: [
        {
          id: 'fetch',
          action: 'Fetching data',
          description: 'Connecting to 5 data sources',
          durationMs: 5000,
        },
        {
          id: 'analyze',
          action: 'Analyzing metrics',
          description: 'Computing KPIs and trends',
          durationMs: 6000,
        },
        {
          id: 'visualize',
          action: 'Creating charts',
          description: 'Generating 8 visualizations',
          durationMs: 5000,
        },
        {
          id: 'summarize',
          action: 'Writing summary',
          description: 'Drafted executive summary with insights',
          durationMs: 6000,
        },
      ],
    },
  ],

  developer: [
    {
      id: 'code-review',
      title: 'Automated Code Review',
      description: 'Review a pull request with 250 lines of code and provide detailed feedback',
      roleId: 'developer',
      estimatedTimeSeconds: 40,
      valueSavedMinutes: 30,
      valueSavedUsd: 25.0,
      employeeId: 'code_reviewer',
      employeeName: 'Code Reviewer',
      isPopular: true,
      steps: [
        {
          id: 'fetch',
          action: 'Fetching PR',
          description: 'Retrieving pull request #142',
          durationMs: 2000,
        },
        {
          id: 'analyze',
          action: 'Analyzing code',
          description: 'Reviewing 250 lines across 8 files',
          durationMs: 10000,
        },
        {
          id: 'issues',
          action: 'Detecting issues',
          description: 'Found 3 potential bugs and 5 style issues',
          durationMs: 5000,
        },
        {
          id: 'suggestions',
          action: 'Writing suggestions',
          description: 'Generated 8 improvement recommendations',
          durationMs: 8000,
        },
        {
          id: 'summary',
          action: 'Creating summary',
          description: 'Compiled review with code examples',
          durationMs: 5000,
        },
      ],
    },
    {
      id: 'test-generator',
      title: 'Auto-Generate Unit Tests',
      description: 'Create comprehensive unit tests for 3 new functions',
      roleId: 'developer',
      estimatedTimeSeconds: 35,
      valueSavedMinutes: 45,
      valueSavedUsd: 37.5,
      employeeId: 'test_generator',
      employeeName: 'Test Generator',
      steps: [
        {
          id: 'analyze',
          action: 'Analyzing code',
          description: 'Understanding function behavior and edge cases',
          durationMs: 6000,
        },
        {
          id: 'generate',
          action: 'Generating tests',
          description: 'Writing 15 test cases with assertions',
          durationMs: 12000,
        },
        {
          id: 'edge-cases',
          action: 'Adding edge cases',
          description: 'Created tests for error conditions',
          durationMs: 5000,
        },
        {
          id: 'verify',
          action: 'Verifying coverage',
          description: 'Achieved 92% code coverage',
          durationMs: 4000,
        },
      ],
    },
    {
      id: 'doc-writer',
      title: 'API Documentation Generator',
      description: 'Generate complete API docs for 12 endpoints',
      roleId: 'developer',
      estimatedTimeSeconds: 30,
      valueSavedMinutes: 90,
      valueSavedUsd: 75.0,
      employeeId: 'doc_writer',
      employeeName: 'Documentation Writer',
      steps: [
        {
          id: 'scan',
          action: 'Scanning endpoints',
          description: 'Found 12 REST endpoints',
          durationMs: 3000,
        },
        {
          id: 'document',
          action: 'Writing docs',
          description: 'Documenting parameters and responses',
          durationMs: 12000,
        },
        {
          id: 'examples',
          action: 'Creating examples',
          description: 'Generated 24 code examples',
          durationMs: 8000,
        },
        {
          id: 'format',
          action: 'Formatting',
          description: 'Exported to Markdown and OpenAPI spec',
          durationMs: 2000,
        },
      ],
    },
  ],

  operations: [
    {
      id: 'data-processor',
      title: 'Process 1000 Customer Records',
      description: 'Clean, validate, and enrich customer data from CSV file',
      roleId: 'operations',
      estimatedTimeSeconds: 30,
      valueSavedMinutes: 180,
      valueSavedUsd: 90.0,
      employeeId: 'data_processor',
      employeeName: 'Data Processor',
      isPopular: true,
      steps: [
        {
          id: 'import',
          action: 'Importing data',
          description: 'Reading 1000 records from CSV',
          durationMs: 3000,
        },
        {
          id: 'clean',
          action: 'Cleaning data',
          description: 'Removing duplicates and fixing formats',
          durationMs: 8000,
        },
        {
          id: 'validate',
          action: 'Validating',
          description: 'Checking email addresses and phone numbers',
          durationMs: 6000,
        },
        {
          id: 'enrich',
          action: 'Enriching',
          description: 'Adding company info and LinkedIn profiles',
          durationMs: 10000,
        },
        {
          id: 'export',
          action: 'Exporting',
          description: 'Saved to database and generated report',
          durationMs: 3000,
        },
      ],
    },
    {
      id: 'report-consolidator',
      title: 'Consolidate Weekly Reports',
      description: 'Merge reports from 15 team members into unified dashboard',
      roleId: 'operations',
      estimatedTimeSeconds: 25,
      valueSavedMinutes: 120,
      valueSavedUsd: 60.0,
      employeeId: 'report_consolidator',
      employeeName: 'Report Consolidator',
      steps: [
        {
          id: 'collect',
          action: 'Collecting reports',
          description: 'Gathering 15 weekly reports',
          durationMs: 4000,
        },
        {
          id: 'parse',
          action: 'Parsing data',
          description: 'Extracting KPIs and metrics',
          durationMs: 6000,
        },
        {
          id: 'merge',
          action: 'Merging',
          description: 'Creating unified view',
          durationMs: 5000,
        },
        {
          id: 'insights',
          action: 'Generating insights',
          description: 'Identified trends and anomalies',
          durationMs: 4000,
        },
      ],
    },
  ],

  sales_marketing: [
    {
      id: 'lead-enricher',
      title: 'Enrich 100 Sales Leads',
      description: 'Add company info, social profiles, and contact details to leads',
      roleId: 'sales_marketing',
      estimatedTimeSeconds: 35,
      valueSavedMinutes: 200,
      valueSavedUsd: 100.0,
      employeeId: 'lead_enricher',
      employeeName: 'Lead Enricher',
      isPopular: true,
      steps: [
        {
          id: 'import',
          action: 'Importing leads',
          description: 'Loading 100 lead records',
          durationMs: 2000,
        },
        {
          id: 'company',
          action: 'Enriching companies',
          description: 'Adding company size, industry, revenue',
          durationMs: 10000,
        },
        {
          id: 'contacts',
          action: 'Finding contacts',
          description: 'Locating email and phone numbers',
          durationMs: 12000,
        },
        {
          id: 'social',
          action: 'Adding social',
          description: 'Found LinkedIn and Twitter profiles',
          durationMs: 6000,
        },
        {
          id: 'score',
          action: 'Scoring leads',
          description: 'Calculated lead scores and priorities',
          durationMs: 5000,
        },
      ],
    },
    {
      id: 'email-campaign',
      title: 'Personalized Email Campaign',
      description: 'Create and send 200 personalized outreach emails',
      roleId: 'sales_marketing',
      estimatedTimeSeconds: 30,
      valueSavedMinutes: 240,
      valueSavedUsd: 120.0,
      employeeId: 'email_campaigner',
      employeeName: 'Email Campaigner',
      steps: [
        {
          id: 'segment',
          action: 'Segmenting audience',
          description: 'Created 5 audience segments',
          durationMs: 4000,
        },
        {
          id: 'personalize',
          action: 'Personalizing',
          description: 'Writing 200 unique emails',
          durationMs: 15000,
        },
        {
          id: 'schedule',
          action: 'Scheduling',
          description: 'Optimizing send times per timezone',
          durationMs: 3000,
        },
        {
          id: 'send',
          action: 'Sending',
          description: 'Sent 200 emails with tracking',
          durationMs: 5000,
        },
      ],
    },
  ],

  designer: [
    {
      id: 'asset-organizer',
      title: 'Organize 500 Design Assets',
      description: 'Sort, tag, and categorize design files by project and type',
      roleId: 'designer',
      estimatedTimeSeconds: 30,
      valueSavedMinutes: 90,
      valueSavedUsd: 45.0,
      employeeId: 'asset_organizer',
      employeeName: 'Asset Organizer',
      isPopular: true,
      steps: [
        {
          id: 'scan',
          action: 'Scanning files',
          description: 'Found 500 design assets',
          durationMs: 4000,
        },
        {
          id: 'analyze',
          action: 'Analyzing',
          description: 'Detecting file types and content',
          durationMs: 8000,
        },
        {
          id: 'categorize',
          action: 'Categorizing',
          description: 'Sorting into project folders',
          durationMs: 6000,
        },
        {
          id: 'tag',
          action: 'Tagging',
          description: 'Applied smart tags and metadata',
          durationMs: 8000,
        },
        {
          id: 'index',
          action: 'Indexing',
          description: 'Created searchable asset library',
          durationMs: 4000,
        },
      ],
    },
    {
      id: 'image-processor',
      title: 'Batch Process 200 Images',
      description: 'Resize, optimize, and export images for web and print',
      roleId: 'designer',
      estimatedTimeSeconds: 25,
      valueSavedMinutes: 60,
      valueSavedUsd: 30.0,
      employeeId: 'image_processor',
      employeeName: 'Image Processor',
      steps: [
        {
          id: 'load',
          action: 'Loading images',
          description: 'Imported 200 high-res images',
          durationMs: 3000,
        },
        {
          id: 'resize',
          action: 'Resizing',
          description: 'Creating web and thumbnail versions',
          durationMs: 10000,
        },
        {
          id: 'optimize',
          action: 'Optimizing',
          description: 'Reduced file size by 70%',
          durationMs: 8000,
        },
        {
          id: 'export',
          action: 'Exporting',
          description: 'Saved 600 files (3 sizes each)',
          durationMs: 4000,
        },
      ],
    },
  ],

  personal: [
    {
      id: 'file-organizer',
      title: 'Organize Downloads Folder',
      description: 'Sort 200 files from Downloads into organized folders',
      roleId: 'personal',
      estimatedTimeSeconds: 25,
      valueSavedMinutes: 30,
      valueSavedUsd: 12.5,
      employeeId: 'file_organizer',
      employeeName: 'File Organizer',
      isPopular: true,
      steps: [
        {
          id: 'scan',
          action: 'Scanning folder',
          description: 'Found 200 unsorted files',
          durationMs: 3000,
        },
        {
          id: 'categorize',
          action: 'Categorizing',
          description: 'Sorting by type and date',
          durationMs: 6000,
        },
        {
          id: 'organize',
          action: 'Organizing',
          description: 'Moving files to folders',
          durationMs: 8000,
        },
        {
          id: 'cleanup',
          action: 'Cleaning up',
          description: 'Deleted duplicates and temp files',
          durationMs: 3000,
        },
      ],
    },
    {
      id: 'email-assistant',
      title: 'Personal Email Assistant',
      description: 'Filter spam, archive newsletters, and highlight important emails',
      roleId: 'personal',
      estimatedTimeSeconds: 30,
      valueSavedMinutes: 45,
      valueSavedUsd: 18.75,
      employeeId: 'email_assistant',
      employeeName: 'Email Assistant',
      steps: [
        {
          id: 'scan',
          action: 'Scanning inbox',
          description: 'Reading 100 emails',
          durationMs: 4000,
        },
        {
          id: 'filter',
          action: 'Filtering spam',
          description: 'Removed 25 spam messages',
          durationMs: 5000,
        },
        {
          id: 'archive',
          action: 'Archiving',
          description: 'Filed 40 newsletters and promotions',
          durationMs: 6000,
        },
        {
          id: 'prioritize',
          action: 'Prioritizing',
          description: 'Flagged 12 important emails',
          durationMs: 5000,
        },
      ],
    },
  ],
};

// Helper function to get demos for a role
export function getDemosForRole(role: UserRole): OnboardingDemo[] {
  return ONBOARDING_DEMOS[role] || [];
}

// Helper function to get a specific demo
export function getDemoById(demoId: string): OnboardingDemo | undefined {
  for (const demos of Object.values(ONBOARDING_DEMOS)) {
    const demo = demos.find((d) => d.id === demoId);
    if (demo) return demo;
  }
  return undefined;
}

// Helper function to get role option
export function getRoleOption(roleId: UserRole): RoleOption | undefined {
  return ROLE_OPTIONS.find((r) => r.id === roleId);
}
