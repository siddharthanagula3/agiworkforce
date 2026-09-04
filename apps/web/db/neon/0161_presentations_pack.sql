-- 0161 : the presentations role bundle.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0145 shipped four true-today role bundles (research-pack, engineering-pack,
-- writing-pack, data-pack); this adds the fifth: presentations. Its one
-- declared skill, presentation-creation, is checked live against
-- GET /api/skills, the same bar 0145 applied to its own three packs, and
-- carries no plugin owner in its SKILL.md frontmatter, so : like
-- engineering-pack, writing-pack, and data-pack : installing this pack does
-- not gate anything: it is a curated bundle, not an access grant.

insert into public.plugin_registry_entries (
  id, name, version, description, category,
  publisher_id, publisher_name, publisher_kind,
  source, status, web_installable,
  declared_skills, required_connectors, capabilities, permissions,
  example_prompts, manifest
) values (
  'presentations-pack',
  'Presentations Pack',
  '1.0.0',
  'Build clear, well-structured presentations from your notes, data, or existing documents.',
  'Productivity',
  'agi', 'AGI', 'first-party',
  'builtin', 'published', true,
  '["presentation-creation"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    "Turn this outline into a ten-slide presentation.",
    "Build a pitch deck from these product notes.",
    "Summarize this report as a five-slide executive briefing.",
    "Rework this presentation for a shorter time slot."
  ]'::jsonb,
  '{
    "name": "presentations-pack",
    "version": "1.0.0",
    "description": "Presentation-building skills for turning notes, data, and documents into clear slide decks.",
    "skills": ["presentation-creation"]
  }'::jsonb
)
on conflict (id) do nothing;
