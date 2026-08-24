-- 0145 — example prompts on the plugin registry, and three real installable
-- role packs.
--
-- Every skill each pack declares below is checked live against GET /api/skills
-- against a running deployment: code-review, systematic-debugging,
-- frontend-design-review, document-creation, presentation-creation,
-- research-and-citations, data-analysis. This migration does not touch the
-- three preview shells seeded by 0096 (github-automation, calendar-assistant,
-- crm-sync) — their declared skills ("Code Review", "Meeting Summarizer", ...)
-- do not correspond to any real skill, so promoting them to web_installable
-- would advertise an install that installs nothing real. They stay preview.

alter table public.plugin_registry_entries
  add column if not exists example_prompts jsonb not null default '[]'::jsonb
  check (jsonb_typeof(example_prompts) = 'array');

comment on column public.plugin_registry_entries.example_prompts is
  'Directory "Try asking" examples for the pack, plain strings. Display copy only — never sent to a model on the visitor''s behalf.';

insert into public.plugin_registry_entries (
  id, name, version, description, category,
  publisher_id, publisher_name, publisher_kind,
  source, status, web_installable,
  declared_skills, required_connectors, capabilities, permissions,
  example_prompts, manifest
) values
  (
    'engineering-pack',
    'Engineering Pack',
    '1.0.0',
    'Review pull requests, debug systematically, and check frontend design quality — a bundle of engineering skills for day-to-day development work.',
    'Developer',
    'agi', 'AGI', 'first-party',
    'builtin', 'published', true,
    '["code-review", "systematic-debugging", "frontend-design-review"]'::jsonb,
    '["github"]'::jsonb,
    '["connectors"]'::jsonb,
    '[]'::jsonb,
    '[
      "Review this pull request for bugs and style issues.",
      "Walk through this stack trace and find the root cause.",
      "Check this landing page redesign against our design system.",
      "Help me debug why this API endpoint is returning 500 errors."
    ]'::jsonb,
    '{
      "name": "engineering-pack",
      "version": "1.0.0",
      "description": "Engineering skills for reviewing, debugging, and design-checking day-to-day development work.",
      "skills": ["code-review", "systematic-debugging", "frontend-design-review"]
    }'::jsonb
  ),
  (
    'writing-pack',
    'Writing Pack',
    '1.0.0',
    'Draft documents, build presentations, and research with citations — a bundle of writing and research skills for polished deliverables.',
    'Productivity',
    'agi', 'AGI', 'first-party',
    'builtin', 'published', true,
    '["document-creation", "presentation-creation", "research-and-citations"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[
      "Draft a project brief for our Q3 launch.",
      "Turn these bullet points into a client-ready presentation.",
      "Find and cite three sources supporting this claim.",
      "Write a one-page summary of this research paper with citations."
    ]'::jsonb,
    '{
      "name": "writing-pack",
      "version": "1.0.0",
      "description": "Writing and research skills for drafting documents, presentations, and cited research.",
      "skills": ["document-creation", "presentation-creation", "research-and-citations"]
    }'::jsonb
  ),
  (
    'data-pack',
    'Data Pack',
    '1.0.0',
    'Analyze datasets and turn the results into clear documents — a bundle of data and reporting skills.',
    'Research',
    'agi', 'AGI', 'first-party',
    'builtin', 'published', true,
    '["data-analysis", "document-creation"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[
      "Analyze this CSV and summarize the key trends.",
      "Find correlations between these two datasets.",
      "Turn this analysis into a shareable report.",
      "Summarize what changed in this quarters numbers."
    ]'::jsonb,
    '{
      "name": "data-pack",
      "version": "1.0.0",
      "description": "Data analysis and reporting skills for turning datasets into clear documents.",
      "skills": ["data-analysis", "document-creation"]
    }'::jsonb
  )
on conflict (id) do nothing;
