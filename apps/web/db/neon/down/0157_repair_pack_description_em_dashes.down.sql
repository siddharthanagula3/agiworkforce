-- Reversal of 0157 — restore the original em-dash pack descriptions from 0145.

begin;

update public.plugin_registry_entries
   set description = 'Review pull requests, debug systematically, and check frontend design quality — a bundle of engineering skills for day-to-day development work.'
 where id = 'engineering-pack';

update public.plugin_registry_entries
   set description = 'Draft documents, build presentations, and research with citations — a bundle of writing and research skills for polished deliverables.'
 where id = 'writing-pack';

update public.plugin_registry_entries
   set description = 'Analyze datasets and turn the results into clear documents — a bundle of data and reporting skills.'
 where id = 'data-pack';

delete from public.schema_migrations
 where filename = '0157_repair_pack_description_em_dashes.sql';

commit;
