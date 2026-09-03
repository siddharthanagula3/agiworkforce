-- 0158: strip the em dash from the three real installable plugin pack
-- descriptions seeded by 0145.
--
-- NOT YET APPLIED: draft only, pending explicit approval before running.
--
-- engineering-pack, writing-pack, and data-pack each shipped with a
-- description built from two clauses joined by an em dash. The repo-wide
-- rule is no em dashes anywhere; this migration is the data-side fix, using
-- a colon to join the same two clauses instead of rewording them.

update public.plugin_registry_entries
   set description =
         'Review pull requests, debug systematically, and check frontend design quality: '
         || 'a bundle of engineering skills for day-to-day development work.',
       updated_at = now()
 where id = 'engineering-pack';

update public.plugin_registry_entries
   set description =
         'Draft documents, build presentations, and research with citations: '
         || 'a bundle of writing and research skills for polished deliverables.',
       updated_at = now()
 where id = 'writing-pack';

update public.plugin_registry_entries
   set description =
         'Analyze datasets and turn the results into clear documents: '
         || 'a bundle of data and reporting skills.',
       updated_at = now()
 where id = 'data-pack';
