-- 0157 — replace the em dash in the three built-in pack descriptions 0145
-- seeded with punctuation the marketing style guide allows.
--
-- 0145 is already applied and append-only migrations cannot be edited in
-- place, so this is a data-only correction of the seeded copy.

update public.plugin_registry_entries
   set description = 'Review pull requests, debug systematically, and check frontend design quality: a bundle of engineering skills for day-to-day development work.'
 where id = 'engineering-pack';

update public.plugin_registry_entries
   set description = 'Draft documents, build presentations, and research with citations: a bundle of writing and research skills for polished deliverables.'
 where id = 'writing-pack';

update public.plugin_registry_entries
   set description = 'Analyze datasets and turn the results into clear documents: a bundle of data and reporting skills.'
 where id = 'data-pack';
